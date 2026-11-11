import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { getProgress, recordSave, submitProgress } from '@/lib/db/progress'
import { activityAutograde, autogradeJobs, progress, reviews } from '@/lib/db/schema'
import { saveAutogradeSettings, setSolution } from '@/lib/db/autograde'
import { writeStored } from '@/lib/storage/files'
import { fakeClient, type AiClient, type PreparedRequest } from '@/lib/autograde/ai'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'
import {
  latestJob, markApplied, processQueued, processRuns, recoverJobs, requestClassCorrection, requestCorrection, runStatus, type Deps,
} from '@/lib/autograde/service'
import { makeSb3 } from './fixtures'

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-'))
})

const say = (text: string) => makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: text }]]])

/** Exécuteur factice : relevé = premier « dire » du projet, identique à chaque graine. */
async function fakeRun(bytes: Uint8Array, _base: unknown, seeds = [1, 2, 3, 4, 5]): Promise<RunResult> {
  const project = JSON.parse(strFromU8(unzipSync(bytes)['project.json']))
  const sprite = project.targets.find((t: { isStage: boolean }) => !t.isStage)
  const sayBlock = Object.values(sprite.blocks as Record<string, { opcode: string; inputs: Record<string, [number, [number, string]]> }>).find((b) => b.opcode === 'looks_say')
  const text = sayBlock ? sayBlock.inputs.MESSAGE[1][1] : ''
  const trace: RunTrace = {
    finished: true, timedOut: false, error: null, says: text ? [{ sprite: 'Sprite1', text, t: 1 }] : [], questions: [], variables: {}, lists: {},
    sprites: [{ name: 'Sprite1', x: 0, y: 0, direction: 90, visible: true, costume: 'costume1', size: 100 }],
    costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' },
  }
  return { project, traces: seeds.map(() => trace) }
}

function spyClient(): AiClient & { requests: PreparedRequest[] } {
  const inner = fakeClient()
  const requests: PreparedRequest[] = []
  return {
    requests,
    grade: (m, req) => { requests.push(req); return inner.grade(m, req) },
    submitBatch: (m, items) => { requests.push(...items.map((i) => i.req)); return inner.submitBatch(m, items) },
    batchResults: (id) => inner.batchResults(id),
  }
}

async function setup(opts: { students: ('same' | 'different')[]; ai?: AiClient | null }) {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const other = await createTeacher(db, { email: 'david.essai@malraux-rabat.org', username: 'david.essai', firstName: 'David', lastName: 'Essai', role: 'prof' })
  const { id: activityId } = await createActivity(db, { title: 'Bonjour' })
  await setActivityStatus(db, activityId, 'published')
  await saveAutogradeSettings(db, activityId, { criteria: ['Le lutin dit Bonjour'], answers: [], keys: [], durationMs: 2000 })
  await writeStored(`solutions/${activityId}.sb3`, say('Bonjour'))
  await setSolution(db, activityId, `solutions/${activityId}.sb3`, 'sb3')
  const cls = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, cls.id, [activityId])
  const names = ['alice.exemple', 'farid.fictif', 'bob.modele']
  const progressIds: string[] = []
  for (const [i, kind] of opts.students.entries()) {
    const s = await createStudent(db, { email: `${names[i]}@malraux-rabat.org` })
    await addEmailsToClass(db, cls.id, [s.email])
    const rel = `projets/${s.id}/p.sb3`
    // Le travail « différent » contient le prénom de l'élève, qui ne doit jamais partir vers l'IA.
    await writeStored(rel, say(kind === 'same' ? 'Bonjour' : `Salut, je suis ${s.firstName} ${s.lastName}`))
    await recordSave(db, s.id, activityId, rel)
    await submitProgress(db, s.id, activityId)
    progressIds.push((await getProgress(db, s.id, activityId))!.id)
  }
  const client = opts.ai === undefined ? spyClient() : opts.ai
  const deps: Deps = { run: fakeRun, ai: () => client, now: () => new Date() }
  return { db, prof, other, activityId, classId: cls.id, progressIds, deps, client }
}

describe('correction d’un défi', () => {
  it('propose sans IA pour un défi identique à la solution ; rien n’est envoyé', async () => {
    const { db, prof, progressIds, deps, client } = await setup({ students: ['same'] })
    expect(await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')).toMatchObject({ ok: true })
    await processQueued(db, deps)
    expect(await latestJob(db, prof.id, progressIds[0])).toMatchObject({ status: 'done', proposal: { decision: 'validated', source: 'tests' } })
    expect((await db.select().from(progress).where(eq(progress.id, progressIds[0])).limit(1))[0]!.status).toBe('submitted')
    expect((client as unknown as { requests: unknown[] }).requests).toHaveLength(0)
  })

  it('« corriger et envoyer » applique la décision, marquée automatique, sans vérificateur', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['different'] })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'send')
    await processQueued(db, deps)
    expect((await db.select().from(progress).where(eq(progress.id, progressIds[0])).limit(1))[0]!.status).toBe('almost')
    expect((await db.select().from(reviews).limit(1))[0]).toMatchObject({ automatic: true, verifiedBy: null, decision: 'almost' })
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('applied')
  })

  it('refuse un second job en cours et un professeur qui ne voit pas l’élève', async () => {
    const { db, prof, other, progressIds, deps } = await setup({ students: ['same'] })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    expect(await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')).toEqual({ ok: false, error: 'Une correction est déjà en cours.' })
    expect(await requestCorrection(db, deps, other.id, progressIds[0], 'propose')).toMatchObject({ ok: false })
  })

  it('deux demandes simultanées (double clic, deux onglets) ne créent qu’une correction', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['same'] })
    const results = await Promise.all([
      requestCorrection(db, deps, prof.id, progressIds[0], 'propose'),
      requestCorrection(db, deps, prof.id, progressIds[0], 'propose'),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'Une correction est déjà en cours.' }])
    expect(await db.select().from(autogradeJobs).where(eq(autogradeJobs.progressId, progressIds[0]))).toHaveLength(1)
  })

  it('deux corrections de classe simultanées ne corrigent chaque défi qu’une fois', async () => {
    const { db, prof, classId, deps } = await setup({ students: ['same', 'different'] })
    const results = await Promise.all([
      requestClassCorrection(db, deps, prof.id, classId, 'propose'),
      requestClassCorrection(db, deps, prof.id, classId, 'propose'),
    ])
    expect(results.reduce((n, r) => n + (r.ok ? r.count : 0), 0)).toBe(2)
    expect(await db.select().from(autogradeJobs)).toHaveLength(2)
  })

  it('ignore le résultat si l’élève a repris son défi (stale)', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['different'] })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'send')
    await db.update(progress).set({ status: 'in_progress' }).where(eq(progress.id, progressIds[0]))
    await processQueued(db, deps)
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('stale')
    expect(await db.select().from(reviews)).toHaveLength(0)
  })

  it('sans clé d’API : échec explicite quand l’IA serait nécessaire', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['different'], ai: null })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    await processQueued(db, deps)
    expect(await latestJob(db, prof.id, progressIds[0])).toMatchObject({ status: 'failed', error: 'Correction automatique non configurée (clé d’API absente).' })
  })

  it('n’envoie à l’IA ni le nom ni l’e-mail de l’élève', async () => {
    const { db, prof, progressIds, deps, client } = await setup({ students: ['different'] })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    await processQueued(db, deps)
    const sent = JSON.stringify((client as unknown as { requests: unknown[] }).requests)
    expect(sent).toContain('[prénom]')
    expect(sent).not.toMatch(/Alice|Exemple|alice\.exemple/i)
  })
})

describe('exécutions de la solution', () => {
  it('la solution n’est exécutée qu’une fois pour plusieurs copies, sauf si elle a échoué', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['different', 'different'] })
    const solution = Buffer.from(say('Bonjour')).toString('base64')
    let solutionRuns = 0, broken = true
    const run: Deps['run'] = async (bytes, base, seeds) => {
      if (Buffer.from(bytes).toString('base64') !== solution) return fakeRun(bytes, base, seeds)
      solutionRuns++
      const r = await fakeRun(bytes, base, seeds)
      // Première exécution ratée (machine surchargée) : elle ne doit pas rester en cache.
      if (broken) { broken = false; return { ...r, traces: r.traces.map((t) => ({ ...t, error: 'boum' })) } }
      return r
    }
    const counted = { ...deps, run }
    for (const id of [progressIds[0], progressIds[1], progressIds[0]]) {
      await db.delete(autogradeJobs).where(eq(autogradeJobs.progressId, id))
      await requestCorrection(db, counted, prof.id, id, 'propose')
      await processQueued(db, counted)
    }
    expect(solutionRuns).toBe(2) // échec puis une seule exécution réussie, réutilisée
    expect((await latestJob(db, prof.id, progressIds[1]))?.status).toBe('done')
  })
})

describe('élève qui reprend son défi pendant la correction', () => {
  it('n’envoie rien à l’IA (appel direct)', async () => {
    const { db, prof, progressIds, deps, client } = await setup({ students: ['different'] })
    await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    // L'élève reprend son défi pendant les exécutions (avant l'appel à l'IA).
    const slowRun: Deps['run'] = async (bytes, base, seeds) => {
      await db.update(progress).set({ status: 'in_progress' }).where(eq(progress.id, progressIds[0]))
      return fakeRun(bytes, base, seeds)
    }
    await processQueued(db, { ...deps, run: slowRun })
    expect((client as unknown as { requests: unknown[] }).requests).toHaveLength(0)
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('stale')
  })

  it('n’envoie pas dans le lot le travail d’un élève qui a repris son défi', async () => {
    const { db, prof, classId, progressIds, deps, client } = await setup({ students: ['different', 'different'] })
    await requestClassCorrection(db, deps, prof.id, classId, 'propose')
    await processQueued(db, deps)
    await db.update(progress).set({ status: 'in_progress' }).where(eq(progress.id, progressIds[0]))
    await processRuns(db, deps)
    expect((client as unknown as { requests: unknown[] }).requests).toHaveLength(1)
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('stale')
  })
})

describe('erreurs de l’IA sur un lot', () => {
  it('n’empêchent pas les autres classes d’avancer, et terminent la correction en échec', async () => {
    const { db, prof, classId, deps } = await setup({ students: ['different', 'different'] })
    const broken: AiClient = { ...fakeClient(), submitBatch: async () => { throw new Error('lot refusé') } }
    await requestClassCorrection(db, deps, prof.id, classId, 'propose')
    await processQueued(db, deps)
    await processRuns(db, { ...deps, ai: () => broken })
    expect(await runStatus(db, prof.id, classId)).toMatchObject({ total: 2, done: 0, failed: 2, finished: true })
  })
})

describe('accès', () => {
  it('un professeur qui ne voit pas l’élève ne lit ni ne marque sa correction', async () => {
    const { db, prof, other, progressIds, deps } = await setup({ students: ['same'] })
    const r = await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    await processQueued(db, deps)
    expect(await latestJob(db, other.id, progressIds[0])).toBeNull()
    expect(await latestJob(db, prof.id, progressIds[0])).not.toBeNull()
    const jobId = (r as { jobId: string }).jobId
    expect(await markApplied(db, jobId, 'autre-defi')).toBe(false) // le job doit appartenir au défi décidé
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('done')
    expect(await markApplied(db, jobId, progressIds[0])).toBe(true)
  })
})

describe('correction d’une classe', () => {
  it('tri sans IA immédiat, lot pour le reste, application une seule fois après reprise', async () => {
    const { db, prof, classId, deps } = await setup({ students: ['same', 'different', 'different'] })
    expect(await requestClassCorrection(db, deps, prof.id, classId, 'send')).toMatchObject({ ok: true, count: 3, skipped: 0 })
    await processQueued(db, deps)
    await processRuns(db, deps)   // envoie le lot (2 défis)
    // « Redémarrage » : un job resté « running » depuis longtemps repasse en file, les lots en attente sont réinterrogés.
    await recoverJobs(db, deps)
    await processRuns(db, deps)   // lot terminé → appliqué
    await processRuns(db, deps)   // rejoué : rien de plus
    expect(await db.select().from(reviews)).toHaveLength(3)
    expect(await runStatus(db, prof.id, classId)).toMatchObject({ total: 3, done: 3, failed: 0 })
  })

  it('reprend un job resté « running » après un redémarrage', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['same'] })
    const r = await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    const jobId = (r as { jobId: string }).jobId
    await db.update(autogradeJobs).set({ status: 'running', startedAt: new Date(Date.now() - 10 * 60_000).toISOString() }).where(eq(autogradeJobs.id, jobId))
    await recoverJobs(db, deps)
    await processQueued(db, deps)
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('done')
  })

  it('au démarrage, reprend aussi un job interrompu récemment', async () => {
    const { db, prof, progressIds, deps } = await setup({ students: ['same'] })
    const r = await requestCorrection(db, deps, prof.id, progressIds[0], 'propose')
    const jobId = (r as { jobId: string }).jobId
    await db.update(autogradeJobs).set({ status: 'running', startedAt: new Date(Date.now() - 2 * 60_000).toISOString() }).where(eq(autogradeJobs.id, jobId))
    await recoverJobs(db, deps)                       // en marche : trop récent pour être repris
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('running')
    await recoverJobs(db, deps, { startup: true })     // au démarrage : un seul processus, rien ne tourne vraiment
    await processQueued(db, deps)
    expect((await latestJob(db, prof.id, progressIds[0]))?.status).toBe('done')
  })

  it('ignore les défis d’activités non préparées', async () => {
    const { db, prof, classId, deps, activityId } = await setup({ students: ['same'] })
    await db.update(activityAutograde).set({ solutionPath: null }).where(eq(activityAutograde.activityId, activityId))
    expect(await requestClassCorrection(db, deps, prof.id, classId, 'propose')).toMatchObject({ ok: true, count: 0, skipped: 1 })
  })
})
