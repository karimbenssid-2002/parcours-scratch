import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { now } from '@/lib/clock'
import { autogradeEnabled } from '@/lib/autograde/enabled'
import { scheduleDrain } from '@/lib/autograde/launch'
import { hasQueued, recoverStuck } from '@/lib/autograde/queue'
import { serverErrorDetail } from '@/lib/auth/google-flow'
import { annualReset, deleteOrphanFolders, type ResetOutcome } from '@/lib/retention/erase'

// Tâche planifiée quotidienne (vercel.json, « crons ») : une requête triviale garde la base Supabase active
// (l'offre gratuite met en pause un projet resté une semaine sans activité). Vercel envoie
// `Authorization: Bearer ${CRON_SECRET}` ; sans CRON_SECRET, la route n'existe pas.
// Filet de sécurité de la correction automatique : reprend les corrections bloquées depuis plus de 15 min et, s'il
// reste des copies en file, les traite après la réponse (même chemin que la route de relance).
// Remise à zéro annuelle (31 juillet, heure de Rabat) : élèves, classes et travaux effacés une fois par an ; si le
// stockage n'est pas fini avant l'échéance, le passage du lendemain reprend. Un échec est journalisé sans bloquer
// la suite de la tâche.
// Puis, chaque jour, les dossiers `projets/<id>/` d'élèves qui n'existent plus sont effacés (suppression d'un élève
// dont les fichiers n'ont pas pu être effacés, envoi direct arrivé après la suppression). Pas pendant une remise à
// zéro inachevée (« partiel ») ni après un échec : le passage du lendemain s'en charge. Ce passage n'écrit aucun
// repère et ne touche pas la base : il ne change rien à la remise à zéro annuelle.
// Échéance commune aux deux : 120 s après le début de l'appel. La file de correction, lancée après la réponse,
// prend des copies jusqu'à 150 s (CLAIM_BUDGET_MS) : elle garde au moins 30 s pour en prendre, et ces copies leurs
// ~150 s pour finir avant les 300 s. L'échéance n'est vérifiée qu'entre deux lectures de liste du stockage.
export const maxDuration = 300
const RETENTION_BUDGET_MS = 120_000

/** Comparaison en temps constant (empreintes de même longueur, quelle que soit la valeur reçue). */
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export async function GET(request: Request) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  if (!secret) return new NextResponse(null, { status: 404 })
  if (!sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  const db = getDb()
  await db.execute(sql`select 1`)
  const deadlineMs = startedAt + RETENTION_BUDGET_MS
  let reset: ResetOutcome | null = null
  try {
    const r = (reset = await annualReset(db, now().getTime(), { deadlineMs }))
    if (r.status === 'fait' || r.status === 'partiel') {
      console.log(`[remise à zéro] année ${r.year} : ${r.students} élèves, ${r.classes} classes, ${r.files} fichiers${r.status === 'partiel' ? ' (à reprendre)' : ''}`)
    } else if (r.status === 'initialise') {
      console.log(`[remise à zéro] repère initialisé à ${r.year}`)
    }
  } catch (e) {
    console.error(`[remise à zéro] échec : ${serverErrorDetail(e)}`)
  }
  if (reset && reset.status !== 'partiel') {
    try {
      const o = await deleteOrphanFolders(db, { deadlineMs })
      if (o.deleted > 0 || !o.complete) console.log(`[dossiers orphelins] ${o.deleted} fichiers effacés${o.complete ? '' : ' (à reprendre)'}`)
    } catch (e) {
      console.error(`[dossiers orphelins] échec : ${serverErrorDetail(e)}`)
    }
  }
  if (autogradeEnabled()) {
    await recoverStuck(db, now())
    if (await hasQueued(db)) scheduleDrain(startedAt, request.headers)
  }
  return NextResponse.json({ ok: true })
}
