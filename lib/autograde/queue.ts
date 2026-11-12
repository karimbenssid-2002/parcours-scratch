// File des corrections automatiques, sans boucle permanente : chaque fonction (lancée par after() après un clic, le
// suivi de l'état, la tâche quotidienne ou la route de relance) prend des copies une à une jusqu'à son échéance, au plus
// 10 exécutions en cours sur tout le site (compté en base), puis se relance elle-même s'il reste du travail.
import { and, asc, count, eq, gt, lt, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { autogradeJobs } from '@/lib/db/schema'
import { closeRunIfDone, correctJob, type Deps } from './service'

export const MAX_RUNNING = 10
/** Tentatives d'exécution d'une copie (une indisponibilité passagère du service est déjà réessayée par le client). */
export const MAX_ATTEMPTS = 2
export const TECHNICAL_FAILURE = 'La correction automatique a échoué, réessayez.'
const STUCK_MS = 15 * 60_000
/** Places toutes prises : nouvel essai de prise toutes les 3 s. */
const POLL_MS = 3_000
/** Une copie prise depuis moins longtemps : une fonction est sans doute en train de passer à la suivante. */
const RECENT_CLAIM_MS = 10_000
/** Verrou de transaction (pg_advisory_xact_lock) qui sérialise les prises de copies entre fonctions. Valable à travers
 * le pooler de Supabase en mode transaction : relâché à la fin de la transaction, jamais attaché à la session. */
const CLAIM_LOCK = 7_320_401

type Job = typeof autogradeJobs.$inferSelect

/** Prend la copie en file la plus ancienne, si moins de `maxRunning` exécutions sont en cours sur tout le site. */
async function claim(db: DB, deps: Deps, maxRunning: number): Promise<Job | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${sql.raw(String(CLAIM_LOCK))})`)
    const [{ n }] = await tx.select({ n: count() }).from(autogradeJobs).where(eq(autogradeJobs.status, 'running'))
    if (n >= maxRunning) return null
    const [next] = await tx.select({ id: autogradeJobs.id }).from(autogradeJobs).where(eq(autogradeJobs.status, 'queued'))
      .orderBy(asc(autogradeJobs.createdAt)).limit(1).for('update', { skipLocked: true })
    if (!next) return null
    const [job] = await tx.update(autogradeJobs)
      .set({ status: 'running', startedAt: deps.now().toISOString(), attempts: sql`${autogradeJobs.attempts} + 1` })
      .where(and(eq(autogradeJobs.id, next.id), eq(autogradeJobs.status, 'queued'))).returning()
    return job ?? null
  })
}

// Seul le nom de l'erreur est journalisé : jamais de contenu d'élève, de jeton ni de secret.
const errorName = (e: unknown) => (e instanceof Error ? e.name : 'erreur')

/**
 * Corrige une copie réclamée ; un échec technique la remet en file, sauf après la dernière tentative. Ne lève jamais :
 * si même l'écriture de l'échec est impossible, la copie reste « running » et sera reprise (recoverStuck).
 * Renvoie vrai si la copie a été remise en file.
 */
async function runOne(db: DB, deps: Deps, job: Job): Promise<boolean> {
  let requeued = false
  try {
    try {
      await correctJob(db, deps, job)
    } catch (e) {
      console.error(`Correction automatique : tentative ${job.attempts} en échec (${errorName(e)})`)
      const last = job.attempts >= MAX_ATTEMPTS
      await db.update(autogradeJobs)
        .set(last ? { status: 'failed', error: TECHNICAL_FAILURE, finishedAt: deps.now().toISOString() } : { status: 'queued', startedAt: null })
        .where(and(eq(autogradeJobs.id, job.id), eq(autogradeJobs.status, 'running')))
      requeued = !last
    }
    await closeRunIfDone(db, deps, job.runId)
  } catch (e) {
    console.error(`Correction automatique : copie laissée en cours, reprise plus tard (${errorName(e)})`)
  }
  return requeued
}

export async function hasQueued(db: DB): Promise<boolean> {
  return (await db.select({ id: autogradeJobs.id }).from(autogradeJobs).where(eq(autogradeJobs.status, 'queued')).limit(1)).length > 0
}
async function anyRunning(db: DB): Promise<boolean> {
  return (await db.select({ id: autogradeJobs.id }).from(autogradeJobs).where(eq(autogradeJobs.status, 'running')).limit(1)).length > 0
}
async function countQueued(db: DB): Promise<number> {
  return (await db.select({ n: count() }).from(autogradeJobs).where(eq(autogradeJobs.status, 'queued')))[0].n
}

/** Attend la fin d'une des copies en cours, ou l'heure `until` (ms), au premier des deux. */
async function waitUntil(inFlight: Set<Promise<unknown>>, until: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = new Promise<void>((r) => { timer = setTimeout(r, Math.max(0, until - Date.now())) })
  try { await Promise.race([...inFlight, tick]) } finally { clearTimeout(timer) }
}

/**
 * Vide la file. Reprend d'abord les copies bloquées (fonction précédente coupée), puis prend les copies une à une
 * (jusqu'à `maxRunning` en parallèle sur tout le site) jusqu'à `deadline` (heure réelle, ms : arrêt des prises).
 * - Toutes les places prises (par cette fonction ou d'autres) : attend qu'une se libère, en revérifiant toutes les
 *   `pollMs` (3 s), sans dépasser l'échéance ; jamais de sortie anticipée tant que des copies attendent.
 * - À l'échéance (même pendant une attente), s'il reste des copies en file : `relaunch()` tout de suite, puis finit les
 *   copies en cours (si la fonction est coupée pendant ce temps, la suivante tourne déjà).
 * - En sortant après l'échéance, s'il reste des copies en file : relance si aucune relance n'a encore réussi (une
 *   seule nouvelle tentative après un échec), ou si une copie de cette fonction a été remise en file après la relance
 *   (la fonction suivante a pu finir entre-temps). Sinon jamais : chaque fonction n'en lance qu'une suivante.
 * - Erreur de prise (pooler, base) : comme une place prise, nouvel essai toutes les `pollMs` jusqu'à l'échéance.
 * - Jamais de relance avant l'échéance, ni si aucune prise n'a abouti dans cette fonction (panne durable) : le suivi de
 *   l'état et la tâche quotidienne reprendront, sans chaîne de fonctions qui se relancent en boucle.
 * `relaunch()` renvoie vrai seulement si la route a accepté (réponse 2xx).
 */
export async function drainQueue(
  db: DB, deps: Deps, opts: { deadline: number; maxRunning?: number; pollMs?: number; relaunch: () => Promise<boolean> },
): Promise<{ handled: number; remaining: number }> {
  const maxRunning = opts.maxRunning ?? MAX_RUNNING
  const pollMs = opts.pollMs ?? POLL_MS
  const inFlight = new Set<Promise<boolean>>()
  let handled = 0
  let relaunched = false
  let relaunchAttempts = 0
  let requeuedSinceRelaunch = false
  let claimAnswered = false // au moins une prise a abouti (copie prise, ou places toutes occupées) : la base répond
  const relaunch = async () => {
    relaunchAttempts++
    // Remis à zéro avant l'appel : une copie remise en file pendant la relance (jusqu'à 15 s) reste comptée.
    const pending = requeuedSinceRelaunch
    requeuedSinceRelaunch = false
    let ok = false
    try { ok = await opts.relaunch() } catch (e) { console.error(`Correction automatique : relance impossible (${errorName(e)})`) }
    if (ok) relaunched = true
    else if (pending) requeuedSinceRelaunch = true
  }
  try { await recoverStuck(db, deps.now()) } catch (e) { console.error(`Correction automatique : reprise impossible (${errorName(e)})`) }
  for (;;) {
    if (Date.now() >= opts.deadline) {
      if (claimAnswered && (await hasQueued(db).catch(() => true))) await relaunch()
      break
    }
    if (inFlight.size >= maxRunning) { await waitUntil(inFlight, opts.deadline); continue }
    let job: Job | null
    try {
      job = await claim(db, deps, maxRunning)
      claimAnswered = true
    } catch (e) {
      // Erreur passagère ou panne : nouvel essai un peu plus tard, jusqu'à l'échéance.
      console.error(`Correction automatique : prise d’une copie impossible (${errorName(e)})`)
      await waitUntil(inFlight, Math.min(opts.deadline, Date.now() + pollMs))
      continue
    }
    if (!job) {
      const queued = await hasQueued(db).catch(() => true) // erreur : on suppose du travail, et on réessaie
      if (!queued && inFlight.size === 0) break // file vide
      // File vide mais copies en cours (l'une peut être remise en file), ou places prises par d'autres fonctions.
      await waitUntil(inFlight, Math.min(opts.deadline, Date.now() + pollMs))
      continue
    }
    handled++
    const p: Promise<boolean> = runOne(db, deps, job).then((requeued) => {
      if (requeued) requeuedSinceRelaunch = true
      return requeued
    }).finally(() => inFlight.delete(p))
    inFlight.add(p)
  }
  await Promise.all(inFlight)
  const remaining = await countQueued(db).catch(() => 1) // base en panne : on suppose du travail (claimAnswered évite de relancer pour rien)
  const retry = relaunched ? requeuedSinceRelaunch : relaunchAttempts < 2
  if (remaining > 0 && claimAnswered && Date.now() >= opts.deadline && retry) await relaunch()
  return { handled, remaining }
}

/**
 * Corrections bloquées (fonction coupée) depuis plus de 15 min : de nouveau en file, ou en échec après la dernière
 * tentative. Renvoie le nombre de copies remises en file. Les « waiting_ai », reliquat de l'ancien fonctionnement par
 * lots, repassent aussi en file.
 */
export async function recoverStuck(db: DB, now: Date): Promise<number> {
  const limit = new Date(now.getTime() - STUCK_MS).toISOString()
  await db.update(autogradeJobs).set({ status: 'queued', startedAt: null, prepared: null }).where(eq(autogradeJobs.status, 'waiting_ai'))
  const stuck = and(eq(autogradeJobs.status, 'running'), lt(autogradeJobs.startedAt, limit))
  const failed = await db.update(autogradeJobs).set({ status: 'failed', error: TECHNICAL_FAILURE, finishedAt: now.toISOString() })
    .where(and(stuck, sql`${autogradeJobs.attempts} >= ${MAX_ATTEMPTS}`)).returning({ runId: autogradeJobs.runId })
  const deps = { now: () => now } as Deps
  for (const runId of new Set(failed.map((f) => f.runId))) await closeRunIfDone(db, deps, runId)
  return (await db.update(autogradeJobs).set({ status: 'queued', startedAt: null }).where(stuck).returning({ id: autogradeJobs.id })).length
}

/**
 * Faut-il lancer une fonction depuis le suivi de l'état (interrogé chaque seconde) ? Seulement s'il reste des copies en
 * file, qu'aucune n'est en cours, et qu'aucune n'a été prise depuis 10 s (une fonction serait en train d'enchaîner).
 */
export async function needsDrain(db: DB, now: Date): Promise<boolean> {
  if (!(await hasQueued(db))) return false
  const recent = new Date(now.getTime() - RECENT_CLAIM_MS).toISOString()
  if (await anyRunning(db)) return false
  const justClaimed = await db.select({ id: autogradeJobs.id }).from(autogradeJobs).where(gt(autogradeJobs.startedAt, recent)).limit(1)
  return justClaimed.length === 0
}
