import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { now } from '@/lib/clock'
import { autogradeEnabled } from '@/lib/autograde/enabled'
import { scheduleDrain } from '@/lib/autograde/launch'
import { hasQueued, recoverStuck } from '@/lib/autograde/queue'

// Tâche planifiée quotidienne (vercel.json, « crons ») : une requête triviale garde la base Supabase active
// (l'offre gratuite met en pause un projet resté une semaine sans activité). Vercel envoie
// `Authorization: Bearer ${CRON_SECRET}` ; sans CRON_SECRET, la route n'existe pas.
// Filet de sécurité de la correction automatique : reprend les corrections bloquées depuis plus de 15 min et, s'il
// reste des copies en file, les traite après la réponse (même chemin que la route de relance).
export const maxDuration = 300

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
  if (autogradeEnabled()) {
    await recoverStuck(db, now())
    if (await hasQueued(db)) scheduleDrain(startedAt, request.headers)
  }
  return NextResponse.json({ ok: true })
}
