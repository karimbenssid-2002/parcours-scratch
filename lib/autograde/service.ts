// Corrections automatiques : demandes (défi ou classe), exécution + tri, IA (appel direct), application.
// Tout l'état est en base ; la file est vidée par lib/autograde/queue.ts (fonctions lancées après la réponse).
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { autogradeJobs, autogradeRuns, autogradeUsage, progress, ACTIVE_JOB_STATUSES, AUTOGRADE_JOB_STATUSES } from '@/lib/db/schema'
import { referenceRun, timedRun } from '@/lib/db/autograde-runs'
import { getStarterPath } from '@/lib/db/activities'
import { getClassForTeacher, listClassMembers, studentClasses } from '@/lib/db/classes'
import { autogradeEffort, autogradeModel, getAutogradeConfig, quotaBlock, quotaState, readyActivityIds } from '@/lib/db/autograde'
import { decide, getReviewView, reviewQueue } from '@/lib/review/service'
import { namesFromEmail } from '@/lib/auth/validation'
import { readStored } from '@/lib/storage/files'
import { parseAiAnswer, prepareRequest, type AiClient, type AiOutcome, type AiUsage } from './ai'
import { differences, summarizeTraces } from './compare'
import { projectInventory, projectToText, type ProjectJson } from './project-text'
import { DEFAULT_ANSWERS, DEFAULT_KEYS } from './runner/defaults'
import type { RunnerDeps } from './runner/types'
import type { PersonNames } from './sanitize'
import { triage, type Proposal } from './triage'

export type Deps = RunnerDeps & {
  ai: () => AiClient | null
  now: () => Date
}
type Status = (typeof AUTOGRADE_JOB_STATUSES)[number]
type Job = typeof autogradeJobs.$inferSelect
export type JobView = { id: string; status: Status; mode: 'propose' | 'send'; proposal: Proposal | null; error: string | null }

/** Verrou de transaction (pg_advisory_xact_lock) pris pendant « vérifier le plafond puis enregistrer la demande » : deux demandes
 * simultanées ne passent pas toutes les deux. Distinct de celui de la file (queue.ts) ; relâché à la fin de la transaction. */
const QUOTA_LOCK = 7_320_402
const lockQuota = (tx: Pick<DB, 'execute'>) => tx.execute(sql`select pg_advisory_xact_lock(${sql.raw(String(QUOTA_LOCK))})`)

const ACTIVE: Status[] = [...ACTIVE_JOB_STATUSES]
const NO_KEY = 'Correction automatique non configurée (clé d’API absente).'

const view = (j: Job): JobView => ({ id: j.id, status: j.status, mode: j.mode, proposal: j.result ? (JSON.parse(j.result) as Proposal) : null, error: j.error })

async function setJob(db: DB, id: string, values: Partial<typeof autogradeJobs.$inferInsert>): Promise<void> {
  await db.update(autogradeJobs).set(values).where(eq(autogradeJobs.id, id))
}
const fail = (db: DB, deps: Deps, id: string, error: string) => setJob(db, id, { status: 'failed', error, finishedAt: deps.now().toISOString() })

async function recordUsage(db: DB, jobId: string, model: string, usage: AiUsage | undefined) {
  if (!usage) return
  await db.insert(autogradeUsage).values({ jobId, model, batch: false, ...usage }) // colonne `batch` gardée pour l'historique
}

async function activeJob(db: DB, progressId: string): Promise<Job | undefined> {
  const [job] = await db.select().from(autogradeJobs).where(and(eq(autogradeJobs.progressId, progressId), inArray(autogradeJobs.status, ACTIVE))).limit(1)
  return job
}

// ---------------------------------------------------------------- demandes

export async function requestCorrection(db: DB, deps: Deps, teacherId: string, progressId: string, mode: 'propose' | 'send'): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const v = await getReviewView(db, teacherId, progressId)
  if (!v) return { ok: false, error: 'Défi introuvable.' }
  if (v.progress.status !== 'submitted' || !v.progress.submittedAt) return { ok: false, error: 'Ce défi n’est plus en attente de validation.' }
  if (!(await readyActivityIds(db)).has(v.progress.activityId)) return { ok: false, error: 'Activité non préparée pour la correction automatique.' }
  return db.transaction(async (tx) => {
    await lockQuota(tx)
    const blocked = quotaBlock(await quotaState(tx, deps.now()), 1)
    if (blocked) return { ok: false as const, error: blocked }
    // L'index unique partiel « autograde_jobs_one_active » tranche entre deux demandes simultanées : aucune ligne = déjà en cours.
    const [job] = await tx.insert(autogradeJobs).values({ progressId, teacherId, mode, submittedAt: v.progress.submittedAt!, createdAt: deps.now().toISOString() })
      .onConflictDoNothing().returning({ id: autogradeJobs.id })
    return job ? { ok: true as const, jobId: job.id } : { ok: false as const, error: 'Une correction est déjà en cours.' }
  })
}

export async function requestClassCorrection(db: DB, deps: Deps, teacherId: string, classId: string, mode: 'propose' | 'send'): Promise<{ ok: true; runId: string | null; count: number; skipped: number } | { ok: false; error: string }> {
  if (!(await getClassForTeacher(db, teacherId, classId))) return { ok: false, error: 'Classe introuvable.' }
  const ready = await readyActivityIds(db)
  const queue = await reviewQueue(db, teacherId, classId)
  const eligible: typeof queue = []
  for (const q of queue) if (ready.has(q.activityId) && !(await activeJob(db, q.progressId))) eligible.push(q)
  const skipped = queue.filter((q) => !ready.has(q.activityId)).length
  if (eligible.length === 0) return { ok: true, runId: null, count: 0, skipped }
  const stamp = deps.now().toISOString()
  return db.transaction(async (tx) => {
    // Une classe qui dépasserait le plafond est refusée en entier (les copies déjà en file, elles, finissent).
    await lockQuota(tx)
    const blocked = quotaBlock(await quotaState(tx, deps.now()), eligible.length)
    if (blocked) return { ok: false as const, error: blocked }
    const [run] = await tx.insert(autogradeRuns).values({ classId, teacherId, mode, createdAt: stamp }).returning()
    let count = 0
    for (const q of eligible) {
      const [p] = await tx.select({ submittedAt: progress.submittedAt }).from(progress).where(eq(progress.id, q.progressId)).limit(1)
      // Défi déjà en cours de correction (demande simultanée) : ignoré grâce à l'index unique partiel.
      const inserted = await tx.insert(autogradeJobs)
        .values({ progressId: q.progressId, teacherId, runId: run.id, mode, submittedAt: p?.submittedAt ?? q.submittedAt, createdAt: stamp })
        .onConflictDoNothing().returning({ id: autogradeJobs.id })
      count += inserted.length
    }
    if (count === 0) {
      await tx.delete(autogradeRuns).where(eq(autogradeRuns.id, run.id))
      return { ok: true as const, runId: null, count: 0, skipped }
    }
    return { ok: true as const, runId: run.id, count, skipped }
  })
}

// ---------------------------------------------------------------- application

/** Le défi est-il toujours l'envoi corrigé ? (Sinon l'élève l'a repris, ou quelqu'un a tranché : on n'envoie rien à l'IA.) */
async function stillSubmitted(db: DB, job: Job): Promise<boolean> {
  const [p] = await db.select({ status: progress.status, submittedAt: progress.submittedAt }).from(progress).where(eq(progress.id, job.progressId)).limit(1)
  return !!p && p.status === 'submitted' && p.submittedAt === job.submittedAt
}

/** Applique une proposition : ignorée si l'élève a repris son défi ou si quelqu'un a déjà tranché. */
async function finish(db: DB, deps: Deps, job: Job, proposal: Proposal): Promise<void> {
  const [p] = await db.select().from(progress).where(eq(progress.id, job.progressId)).limit(1)
  const stamp = deps.now().toISOString()
  const result = JSON.stringify(proposal)
  if (!p || p.status !== 'submitted' || p.submittedAt !== job.submittedAt) return setJob(db, job.id, { status: 'stale', result, finishedAt: stamp })
  if (job.mode === 'propose') return setJob(db, job.id, { status: 'done', result, finishedAt: stamp })
  const r = await decide(db, job.teacherId, job.progressId, { decision: proposal.decision, comment: proposal.comment }, { automatic: true, verifiedBy: null })
  await setJob(db, job.id, { status: r.ok ? 'applied' : 'stale', result, finishedAt: stamp })
}

async function applyOutcome(db: DB, deps: Deps, job: Job, outcome: AiOutcome, criteriaCount: number, model: string) {
  await recordUsage(db, job.id, model, outcome.usage)
  if (!outcome.ok) return fail(db, deps, job.id, outcome.error)
  // Revalidé avec le vrai nombre de critères.
  const proposal = parseAiAnswer(outcome.proposal, criteriaCount, outcome.proposal.model ?? model)
  if (!proposal) return fail(db, deps, job.id, 'Réponse de l’IA invalide.')
  await finish(db, deps, job, proposal)
}

// ---------------------------------------------------------------- exécution

/** Prénoms et noms à masquer : l'élève et les membres de toutes ses classes. */
async function personNames(db: DB, email: string, firstName: string, lastName: string): Promise<PersonNames> {
  const firstNames = new Set([firstName]), lastNames = new Set([lastName])
  for (const c of await studentClasses(db, email)) {
    for (const m of await listClassMembers(db, c.id)) {
      const n = m.student ?? namesFromEmail(m.email)
      firstNames.add(n.firstName)
      lastNames.add(n.lastName)
    }
  }
  return { firstNames: [...firstNames], lastNames: [...lastNames] }
}

/**
 * Corrige une copie déjà réclamée (« running »). Les échecs expliqués (activité non préparée, refus de l'IA…) sont
 * enregistrés ici ; une exception est un échec technique, que la file retente (lib/autograde/queue.ts).
 */
export async function correctJob(db: DB, deps: Deps, job: Job): Promise<void> {
  const [p] = await db.select().from(progress).where(eq(progress.id, job.progressId)).limit(1)
  if (!p || p.status !== 'submitted' || p.submittedAt !== job.submittedAt) return setJob(db, job.id, { status: 'stale', finishedAt: deps.now().toISOString() })
  const config = await getAutogradeConfig(db, p.activityId)
  if (!config || config.criteria.length === 0) return fail(db, deps, job.id, 'Activité non préparée pour la correction automatique.')
  const studentBytes = p.projectPath ? await readStored(p.projectPath) : null
  if (!studentBytes) return fail(db, deps, job.id, 'Projet de l’élève introuvable.')
  const solutionBytes = await readStored(config.solutionPath)
  if (!solutionBytes) return fail(db, deps, job.id, 'Solution de référence introuvable.')

  const base = { answers: config.answers.length ? config.answers : DEFAULT_ANSWERS, keys: config.keys.length ? config.keys : DEFAULT_KEYS, durationMs: config.durationMs }
  const starterPath = await getStarterPath(db, p.activityId)
  const starterBytes = starterPath ? await readStored(starterPath) : null
  // Les trois exécutions sont indépendantes : en parallèle (solution et départ viennent en général de la base).
  const [student, solution, starterRun] = await Promise.all([
    timedRun(db, deps, 'eleve', job.id, new Uint8Array(studentBytes), base),
    referenceRun(db, deps, solutionBytes, base, undefined, job.id),
    starterBytes ? referenceRun(db, deps, starterBytes, base, [1], job.id) : null,
  ])
  if (!solution.project || solution.traces.some((t) => t.error)) return fail(db, deps, job.id, 'La solution de référence n’a pas pu être exécutée.')
  const starter = starterRun ? (starterRun.project as ProjectJson | null) : null

  const t = triage({
    student: { project: student.project as ProjectJson | null, traces: student.traces },
    solution: { project: solution.project as ProjectJson, traces: solution.traces },
    starter, criteriaCount: config.criteria.length,
  })
  if (t.kind === 'failed') return fail(db, deps, job.id, t.error)
  if (t.kind === 'decided') return finish(db, deps, job, t.proposal)

  const v = await getReviewView(db, job.teacherId, job.progressId)
  if (!v) return fail(db, deps, job.id, 'Défi introuvable.')
  const studentProject = student.project as ProjectJson
  const solutionProject = solution.project as ProjectJson
  const req = prepareRequest({
    instructions: v.activity.instructions ?? '',
    criteria: config.criteria,
    solutionText: `${projectToText(solutionProject)}\n\n# Costumes et sons\n${projectInventory(solutionProject)}`,
    solutionSummary: summarizeTraces(solution.traces),
    studentText: `${projectToText(studentProject)}\n\n# Costumes et sons\n${projectInventory(studentProject)}`,
    studentSummary: summarizeTraces(student.traces),
    differences: differences(student.traces, solution.traces),
  }, await personNames(db, v.student.email, v.student.firstName, v.student.lastName))

  const client = deps.ai()
  if (!client) return fail(db, deps, job.id, NO_KEY)
  // Les exécutions prennent du temps : l'élève a pu reprendre son défi entre-temps.
  if (!(await stillSubmitted(db, job))) return setJob(db, job.id, { status: 'stale', finishedAt: deps.now().toISOString() })
  const model = await autogradeModel(db)
  const effort = await autogradeEffort(db)
  await applyOutcome(db, deps, job, await client.grade(model, req, effort), config.criteria.length, model)
}

/** Une correction de classe est terminée quand plus aucune de ses copies n'est active. */
export async function closeRunIfDone(db: DB, deps: Deps, runId: string | null): Promise<void> {
  if (!runId) return
  const still = await db.select({ id: autogradeJobs.id }).from(autogradeJobs)
    .where(and(eq(autogradeJobs.runId, runId), inArray(autogradeJobs.status, ACTIVE))).limit(1)
  if (still.length === 0) await db.update(autogradeRuns).set({ finishedAt: deps.now().toISOString() }).where(and(eq(autogradeRuns.id, runId), isNull(autogradeRuns.finishedAt)))
}

// ---------------------------------------------------------------- lectures

/** Dernière correction d'un défi, seulement pour un professeur qui voit l'élève (ou l'admin). */
export async function latestJob(db: DB, teacherId: string, progressId: string): Promise<JobView | null> {
  if (!(await getReviewView(db, teacherId, progressId))) return null
  const [j] = await db.select().from(autogradeJobs).where(eq(autogradeJobs.progressId, progressId)).orderBy(desc(autogradeJobs.createdAt)).limit(1)
  return j ? view(j) : null
}

export async function runStatus(db: DB, teacherId: string, classId: string): Promise<{ runId: string; total: number; done: number; failed: number; mode: 'propose' | 'send'; finished: boolean } | null> {
  const [run] = await db.select().from(autogradeRuns).where(and(eq(autogradeRuns.classId, classId), eq(autogradeRuns.teacherId, teacherId)))
    .orderBy(desc(autogradeRuns.createdAt)).limit(1)
  if (!run) return null
  const jobs = await db.select({ status: autogradeJobs.status }).from(autogradeJobs).where(eq(autogradeJobs.runId, run.id))
  return {
    runId: run.id, mode: run.mode, total: jobs.length, finished: run.finishedAt !== null || (jobs.length > 0 && jobs.every((j) => !ACTIVE.includes(j.status))),
    done: jobs.filter((j) => j.status === 'done' || j.status === 'applied').length,
    failed: jobs.filter((j) => j.status === 'failed' || j.status === 'stale').length,
  }
}

/** Propositions en attente d'envoi par le professeur (encore valables pour l'envoi actuel de l'élève). */
export async function pendingProposals(db: DB, progressIds: string[]): Promise<Map<string, { jobId: string; proposal: Proposal }>> {
  if (progressIds.length === 0) return new Map()
  const rows = await db.select({ job: autogradeJobs, submittedAt: progress.submittedAt }).from(autogradeJobs)
    .innerJoin(progress, eq(progress.id, autogradeJobs.progressId))
    .where(and(inArray(autogradeJobs.progressId, progressIds), eq(autogradeJobs.status, 'done'), eq(autogradeJobs.mode, 'propose')))
    .orderBy(asc(autogradeJobs.createdAt))
  const out = new Map<string, { jobId: string; proposal: Proposal }>()
  for (const r of rows) if (r.submittedAt === r.job.submittedAt && r.job.result) out.set(r.job.progressId, { jobId: r.job.id, proposal: JSON.parse(r.job.result) as Proposal })
  return out
}

/** Proposition envoyée par le professeur. Le job doit concerner le défi qu'il vient de trancher (vérifié par l'appelant). */
export async function markApplied(db: DB, jobId: string, progressId: string): Promise<boolean> {
  return (await db.update(autogradeJobs).set({ status: 'applied' })
    .where(and(eq(autogradeJobs.id, jobId), eq(autogradeJobs.progressId, progressId), eq(autogradeJobs.status, 'done')))
    .returning({ id: autogradeJobs.id })).length === 1
}

export type JobBadge = { kind: 'running' } | { kind: 'proposed'; decision: Proposal['decision'] } | { kind: 'failed' }

/** Badge de la file « À valider » : dernière correction de chaque défi encore pertinente. */
export async function jobBadges(db: DB, progressIds: string[]): Promise<Map<string, JobBadge>> {
  if (progressIds.length === 0) return new Map()
  const rows = await db.select({ job: autogradeJobs, submittedAt: progress.submittedAt }).from(autogradeJobs)
    .innerJoin(progress, eq(progress.id, autogradeJobs.progressId))
    .where(inArray(autogradeJobs.progressId, progressIds)).orderBy(asc(autogradeJobs.createdAt))

  const out = new Map<string, JobBadge>()
  for (const { job, submittedAt } of rows) {
    if (job.submittedAt !== submittedAt) continue // correction d'un envoi précédent
    if (ACTIVE.includes(job.status)) out.set(job.progressId, { kind: 'running' })
    else if (job.status === 'done' && job.result) out.set(job.progressId, { kind: 'proposed', decision: (JSON.parse(job.result) as Proposal).decision })
    else if (job.status === 'failed') out.set(job.progressId, { kind: 'failed' })
    else out.delete(job.progressId)
  }
  return out
}
