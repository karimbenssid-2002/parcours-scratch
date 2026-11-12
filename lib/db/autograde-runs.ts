import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from './client'
import { autogradeReferenceRuns, autogradeRunnerCalls } from './schema'
import type { RunnerDeps, RunOptions, RunResult } from '@/lib/autograde/runner/types'

export type RunnerCallKind = 'eleve' | 'reference' | 'test'

export async function recordRunnerCall(db: DB, call: { jobId?: string | null; durationMs: number; kind: RunnerCallKind }): Promise<void> {
  await db.insert(autogradeRunnerCalls).values({ jobId: call.jobId ?? null, durationMs: Math.max(0, Math.round(call.durationMs)), kind: call.kind })
}

/** Écriture annexe (compteur, relevé gardé) : un échec ne doit jamais faire perdre une exécution terminée. Seul le nom de l'erreur est journalisé. */
async function bestEffort(what: string, write: () => Promise<unknown>): Promise<void> {
  try { await write() } catch (e) { console.error(`autograde : écriture « ${what} » impossible (${e instanceof Error ? e.name : 'erreur'})`) }
}

/** Une exécution qui a levé une erreur a-t-elle quand même sollicité le service ? (Sinon : configuration, jeton… rien à compter.) */
const reachedService = (e: unknown) => !!e && typeof e === 'object' && (e as { reachedService?: unknown }).reachedService === true

/**
 * Exécute un projet et, pour le service distant seulement, enregistre l'appel (même si l'exécution échoue, tant qu'elle a atteint le service).
 * Une erreur levée avant d'atteindre le service n'est pas enregistrée : elle n'a rien consommé.
 */
export async function timedRun(
  db: DB, deps: RunnerDeps, kind: RunnerCallKind, jobId: string | null,
  bytes: Uint8Array, base: Omit<RunOptions, 'seed'>, seeds?: number[],
): Promise<RunResult> {
  const started = Date.now()
  let result: RunResult
  try {
    result = await deps.run(bytes, base, seeds)
  } catch (e) {
    if (deps.runner === 'remote' && reachedService(e)) await bestEffort('appel', () => recordRunnerCall(db, { jobId, durationMs: Date.now() - started, kind }))
    throw e
  }
  if (deps.runner === 'remote') await bestEffort('appel', () => recordRunnerCall(db, { jobId, durationMs: Date.now() - started, kind }))
  return result
}

const failed = (r: RunResult) => !r.project || r.traces.some((t) => t.error || t.cut)

/**
 * Relevé de la solution ou du projet de départ, lu en base s'il y est déjà, sinon exécuté puis gardé.
 * Clé : SHA-256 des octets + réglages + graines (les octets du projet ne sont ni gardés ni journalisés).
 * Un relevé raté (erreur, coupure, pas de projet) n'est pas gardé : il sera retenté à la prochaine correction.
 */
export function referenceRun(db: DB, deps: RunnerDeps, bytes: Buffer, base: Omit<RunOptions, 'seed'>, seeds?: number[], jobId: string | null = null): Promise<RunResult> {
  const key = `${createHash('sha256').update(bytes).digest('hex')}|${JSON.stringify(base)}|${seeds?.join(',') ?? ''}`
  // Rafale (une classe entière, dix copies à la fois) sur un relevé pas encore gardé : une seule exécution par clé dans
  // ce processus, partagée par toutes les copies qui l'attendent. Retirée dès qu'elle se termine ; un échec n'est pas gardé.
  const running = inFlight.get(key)
  if (running) return running
  const p = computeReference(db, deps, key, bytes, base, seeds, jobId).finally(() => { if (inFlight.get(key) === p) inFlight.delete(key) })
  inFlight.set(key, p)
  return p
}

const inFlight = new Map<string, Promise<RunResult>>()

async function computeReference(db: DB, deps: RunnerDeps, key: string, bytes: Buffer, base: Omit<RunOptions, 'seed'>, seeds: number[] | undefined, jobId: string | null): Promise<RunResult> {
  const [hit] = await db.select({ result: autogradeReferenceRuns.result }).from(autogradeReferenceRuns).where(eq(autogradeReferenceRuns.key, key)).limit(1)
  if (hit) return JSON.parse(hit.result) as RunResult
  const result = await timedRun(db, deps, 'reference', jobId, new Uint8Array(bytes), base, seeds)
  // Deux corrections simultanées de la même activité (autres processus) : la seconde insertion est simplement ignorée.
  if (!failed(result)) await bestEffort('relevé', () => db.insert(autogradeReferenceRuns).values({ key, result: JSON.stringify(result) }).onConflictDoNothing())
  return result
}
