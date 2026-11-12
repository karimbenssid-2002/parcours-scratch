import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { count, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { getProgress, recordSave, submitProgress } from '@/lib/db/progress'
import { autogradeJobs } from '@/lib/db/schema'
import { saveAutogradeSettings, setSolution } from '@/lib/db/autograde'
import { writeStored } from '@/lib/storage/files'
import { fakeClient } from '@/lib/autograde/ai'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'
import { RunnerError } from '@/lib/autograde/runner/remote'
import { requestClassCorrection, requestCorrection, runStatus, type Deps } from '@/lib/autograde/service'
import { drainQueue, needsDrain, recoverStuck, TECHNICAL_FAILURE } from '@/lib/autograde/queue'
import { makeSb3 } from './fixtures'

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-file-'))
})

const say = (text: string) => makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: text }]]])
// Octets exacts de la solution (makeSb3 ne donne pas deux fois les mêmes octets) : reconnue par le faux exécuteur.
const SOLUTION_BYTES = say('Bonjour')
const SOLUTION = Buffer.from(SOLUTION_BYTES).toString('base64')
const isSolution = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64') === SOLUTION
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

// Prénoms inventés, en lettres seulement (les adresses des élèves donnent prénom.nom).
const letters = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))

/** Deux enseignants, chacun une classe de `perClass` élèves qui ont rendu le même défi. */
async function setup(perClass: number) {
  const db = await testDb()
  const { id: activityId } = await createActivity(db, { title: 'Bonjour' })
  await setActivityStatus(db, activityId, 'published')
  await saveAutogradeSettings(db, activityId, { criteria: ['Le lutin dit Bonjour'], answers: [], keys: [], durationMs: 2000 })
  await writeStored(`solutions/${activityId}.sb3`, SOLUTION_BYTES)
  await setSolution(db, activityId, `solutions/${activityId}.sb3`, 'sb3')
  const classes: { teacherId: string; classId: string; progressIds: string[] }[] = []
  for (const [c, who] of (['ines.essai', 'hugo.fictif'] as const).entries()) {
    const prof = await createTeacher(db, { email: `${who}@malraux-rabat.org`, username: who, firstName: 'Prof', lastName: 'Essai', role: 'prof' })
    const cls = await createClass(db, prof.id, { name: `5e ${c}`, level: '5' })
    await addAssignments(db, cls.id, [activityId])
    const progressIds: string[] = []
    for (let i = 0; i < perClass; i++) {
      const s = await createStudent(db, { email: `eleve${letters(c * perClass + i)}.inventee@malraux-rabat.org` })
      await addEmailsToClass(db, cls.id, [s.email])
      const rel = `projets/${s.id}/p.sb3`
      await writeStored(rel, say(i % 2 ? 'Bonjour' : 'Salut'))
      await recordSave(db, s.id, activityId, rel)
      await submitProgress(db, s.id, activityId)
      progressIds.push((await getProgress(db, s.id, activityId))!.id)
    }
    classes.push({ teacherId: prof.id, classId: cls.id, progressIds })
  }
  const client = fakeClient()
  const deps: Deps = { run: fakeRun, runner: 'remote', ai: () => client, now: () => new Date() }
  return { db, classes, deps }
}

const running = async (db: DB) => (await db.select({ n: count() }).from(autogradeJobs).where(eq(autogradeJobs.status, 'running')))[0].n
const jobs = (db: DB) => db.select().from(autogradeJobs)
/** Relance réussie (la route a répondu 202), sans rien lancer. */
const noRelaunch = async () => true
const later = () => Date.now() + 60_000

describe('file des corrections', () => {
  it('deux classes de 27 lancées ensemble par deux enseignants : jamais plus de 10 exécutions en cours, toutes finissent', async () => {
    const { db, classes, deps } = await setup(27)
    for (const c of classes) expect(await requestClassCorrection(db, deps, c.teacherId, c.classId, 'propose')).toMatchObject({ ok: true, count: 27 })

    let now = 0, max = 0, maxRunningInDb = 0
    const run: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      now++; max = Math.max(max, now)
      maxRunningInDb = Math.max(maxRunningInDb, await running(db))
      await sleep(40)
      now--
      return fakeRun(bytes, base, seeds)
    }
    const d = { ...deps, run }
    // Deux fonctions lancées en même temps (un clic de chaque enseignant).
    const results = await Promise.all([
      drainQueue(db, d, { deadline: later(), relaunch: noRelaunch }),
      drainQueue(db, d, { deadline: later(), relaunch: noRelaunch }),
    ])
    expect(max).toBeLessThanOrEqual(10)
    expect(max).toBeGreaterThan(2) // en parallèle, pas une à une (10 atteint sur une machine peu chargée)
    expect(maxRunningInDb).toBeLessThanOrEqual(10)
    expect(results[0].handled + results[1].handled).toBe(54)
    expect((await jobs(db)).every((j) => j.status === 'done')).toBe(true)
    for (const c of classes) expect(await runStatus(db, c.teacherId, c.classId)).toMatchObject({ total: 27, done: 27, finished: true })
  }, 120_000)

  it('échéance atteinte avec des copies en file : relance une seule fois, et la relance vide la file (navigateur fermé)', async () => {
    const { db, classes, deps } = await setup(3)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    let relaunches = 0
    const slow: Deps['run'] = async (bytes, base, seeds) => { if (!isSolution(bytes)) await sleep(400); return fakeRun(bytes, base, seeds) }
    const d = { ...deps, run: slow }
    let followUp: Promise<unknown> | null = null
    // Une seule copie à la fois et une échéance très proche : la fonction s'arrête avec des copies en file.
    const first = await drainQueue(db, d, {
      deadline: Date.now() + 200, maxRunning: 1,
      relaunch: async () => { relaunches++; followUp = drainQueue(db, d, { deadline: later(), relaunch: async () => { relaunches++; return true } }); return true },
    })
    expect(relaunches).toBe(1)
    expect(first.handled).toBeGreaterThanOrEqual(1)
    expect(first.handled).toBeLessThan(3)
    await followUp
    expect(relaunches).toBe(1)
    expect((await jobs(db)).every((j) => j.status === 'done')).toBe(true)
  })

  it('copie remise en file après l’échéance (échec technique), plus aucune fonction au travail : relance une fois', async () => {
    const { db, classes, deps } = await setup(1)
    await requestCorrection(db, deps, classes[0].teacherId, classes[0].progressIds[0], 'propose')
    const failsLate: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      await sleep(300)
      throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true)
    }
    let relaunches = 0
    expect(await drainQueue(db, { ...deps, run: failsLate }, { deadline: Date.now() + 100, relaunch: async () => { relaunches++; return true } }))
      .toEqual({ handled: 1, remaining: 1 })
    expect(relaunches).toBe(1)
    expect((await jobs(db))[0]).toMatchObject({ status: 'queued', attempts: 1 })
  })

  it('relance ratée à l’échéance (réseau, refus, délai) : réessayée une fois en sortant ; réussie : jamais répétée', async () => {
    for (const answers of [[false, true], [true]]) {
      const { db, classes, deps } = await setup(2)
      await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
      const long: Deps['run'] = async (bytes, base, seeds) => { if (!isSolution(bytes)) await sleep(400); return fakeRun(bytes, base, seeds) }
      const calls: number[] = []
      const queue = [...answers]
      await drainQueue(db, { ...deps, run: long }, {
        deadline: Date.now() + 100, maxRunning: 1,
        relaunch: async () => { calls.push(Date.now()); return queue.shift() ?? true },
      })
      expect(calls).toHaveLength(answers.length)
    }
  })

  it('relance ratée deux fois : abandon (le suivi de l’état et la tâche quotidienne reprendront)', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const long: Deps['run'] = async (bytes, base, seeds) => { if (!isSolution(bytes)) await sleep(300); return fakeRun(bytes, base, seeds) }
    let calls = 0
    await drainQueue(db, { ...deps, run: long }, { deadline: Date.now() + 100, maxRunning: 1, relaunch: async () => { calls++; return false } })
    expect(calls).toBe(2)
  })

  it('une erreur de prise passagère (pooler) : nouvel essai, la file est vidée quand même', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tx = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('pooler'))
    try {
      expect(await drainQueue(db, deps, { deadline: later(), pollMs: 20, relaunch: noRelaunch })).toEqual({ handled: 2, remaining: 0 })
    } finally {
      tx.mockRestore(); error.mockRestore()
    }
  })

  it('lecture de la file impossible quand aucune copie n’est prise : on suppose du travail, nouvel essai, la file est vidée', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    // Les prises réussissent ; la première lecture « reste-t-il des copies en file ? » (hasQueued) échoue une fois.
    const real = db.select.bind(db) as (...a: unknown[]) => unknown
    let thrown = 0
    const spy = vi.spyOn(db, 'select').mockImplementation(((...args: unknown[]) => {
      const cols = args[0] && typeof args[0] === 'object' ? Object.keys(args[0] as object).join() : ''
      if (thrown === 0 && cols === 'id') { thrown++; throw new Error('pooler') }
      return real(...args)
    }) as never)
    try {
      expect(await drainQueue(db, deps, { deadline: later(), pollMs: 20, relaunch: noRelaunch })).toEqual({ handled: 2, remaining: 0 })
    } finally {
      spy.mockRestore()
    }
    expect(thrown).toBe(1)
    expect((await jobs(db)).every((j) => j.status === 'done')).toBe(true)
  })

  it('décompte final de la file impossible (base en panne en sortant) : ne rejette pas, la relance de sortie est tentée', async () => {
    const { db, classes, deps } = await setup(1)
    await requestCorrection(db, deps, classes[0].teacherId, classes[0].progressIds[0], 'propose')
    const failsLate: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      await sleep(300)
      throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true)
    }
    const real = db.select.bind(db) as (...a: unknown[]) => unknown
    const spy = vi.spyOn(db, 'select').mockImplementation(((...args: unknown[]) => {
      if (args[0] && typeof args[0] === 'object' && Object.keys(args[0] as object).join() === 'n') throw new Error('pooler')
      return real(...args)
    }) as never)
    let relaunches = 0
    try {
      expect(await drainQueue(db, { ...deps, run: failsLate }, { deadline: Date.now() + 100, relaunch: async () => { relaunches++; return true } }))
        .toEqual({ handled: 1, remaining: 1 })
    } finally {
      spy.mockRestore()
    }
    expect(relaunches).toBe(1)
  })

  it('prise toujours impossible (base en panne) : essais espacés jusqu’à l’échéance, puis aucune relance', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tx = vi.spyOn(db, 'transaction').mockRejectedValue(new Error('pooler'))
    try {
      let relaunches = 0
      const started = Date.now()
      expect(await drainQueue(db, deps, { deadline: started + 300, pollMs: 50, relaunch: async () => { relaunches++; return true } })).toEqual({ handled: 0, remaining: 2 })
      expect(Date.now() - started).toBeGreaterThanOrEqual(290) // pas de sortie anticipée
      expect(relaunches).toBe(0) // panne durable : pas de chaîne de fonctions
      expect(tx.mock.calls.length).toBeGreaterThanOrEqual(3)
      expect(tx.mock.calls.length).toBeLessThanOrEqual(300 / 50 + 2) // ≈ échéance / pollMs
    } finally {
      tx.mockRestore(); error.mockRestore()
    }
  })

  it('copie remise en file pendant une relance lente qui réussit : relance encore en sortant', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    let calls = 0
    const firstFails: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      if (++calls === 1) { await sleep(300); throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true) }
      return fakeRun(bytes, base, seeds)
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let relaunches = 0
    // La relance part à 100 ms et répond (202) à 500 ms ; la copie en cours est remise en file à 300 ms.
    await drainQueue(db, { ...deps, run: firstFails }, {
      deadline: Date.now() + 100, maxRunning: 1,
      relaunch: async () => { relaunches++; if (relaunches === 1) await sleep(400); return true },
    })
    error.mockRestore()
    expect(relaunches).toBe(2)
  })

  it('file vide ou vidée avant l’échéance : aucune relance', async () => {
    const { db, classes, deps } = await setup(2)
    let relaunches = 0
    expect(await drainQueue(db, deps, { deadline: later(), relaunch: async () => { relaunches++; return true } })).toEqual({ handled: 0, remaining: 0 })
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    expect(await drainQueue(db, deps, { deadline: later(), relaunch: async () => { relaunches++; return true } })).toEqual({ handled: 2, remaining: 0 })
    expect(relaunches).toBe(0)
  })

  it('places toutes prises par une autre fonction : attend une place (sans quitter) puis prend la copie', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const [a] = await jobs(db)
    await db.update(autogradeJobs).set({ status: 'running', startedAt: new Date().toISOString() }).where(eq(autogradeJobs.id, a.id))
    // L'autre fonction finit sa copie un peu plus tard.
    const other = sleep(200).then(() => db.update(autogradeJobs).set({ status: 'done' }).where(eq(autogradeJobs.id, a.id)))
    let relaunches = 0
    expect(await drainQueue(db, deps, { deadline: later(), maxRunning: 1, pollMs: 50, relaunch: async () => { relaunches++; return true } })).toEqual({ handled: 1, remaining: 0 })
    await other
    expect(relaunches).toBe(0)
  })

  it('places toutes prises jusqu’à l’échéance : relance avec les copies encore en file', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const [a] = await jobs(db)
    await db.update(autogradeJobs).set({ status: 'running', startedAt: new Date().toISOString() }).where(eq(autogradeJobs.id, a.id))
    let relaunches = 0
    expect(await drainQueue(db, deps, { deadline: Date.now() + 200, maxRunning: 1, pollMs: 50, relaunch: async () => { relaunches++; return true } })).toEqual({ handled: 0, remaining: 1 })
    expect(relaunches).toBe(1)
  })

  it('copie en cours qui dépasse l’échéance : la relance part à l’échéance, sans attendre la fin de la copie', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    let finishedAt = 0, relaunchedAt = 0
    const long: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      await sleep(700)
      finishedAt ||= Date.now()
      return fakeRun(bytes, base, seeds)
    }
    const r = drainQueue(db, { ...deps, run: long }, { deadline: Date.now() + 100, maxRunning: 1, relaunch: async () => { relaunchedAt = Date.now(); return true } })
    await r
    expect(relaunchedAt).toBeGreaterThan(0)
    expect(relaunchedAt).toBeLessThan(finishedAt) // une fonction coupée à 300 s pendant cette copie aurait déjà relancé
  })

  it('copie remise en file après la relance, la fonction suivante déjà terminée : relance encore', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    let calls = 0
    const firstFailsLate: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      if (++calls === 1) { await sleep(500); throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true) }
      return fakeRun(bytes, base, seeds)
    }
    const d = { ...deps, run: firstFailsLate }
    let relaunches = 0
    let successor: Promise<unknown> = Promise.resolve()
    await drainQueue(db, d, {
      deadline: Date.now() + 100, maxRunning: 1,
      // La fonction suivante prend l'autre copie et s'arrête, file vide, avant l'échec de la première.
      relaunch: async () => { if (++relaunches === 1) successor = drainQueue(db, d, { deadline: later(), relaunch: noRelaunch }); return true },
    })
    await successor
    expect(relaunches).toBe(2)
    expect((await jobs(db)).map((j) => j.status).sort()).toEqual(['done', 'queued'])
  })

  it('chaque fonction reprend d’abord les copies bloquées (coupée à 300 s)', async () => {
    const { db, classes, deps } = await setup(1)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    await db.update(autogradeJobs).set({ status: 'running', attempts: 1, startedAt: new Date(Date.now() - 16 * 60_000).toISOString() })
    expect(await drainQueue(db, deps, { deadline: later(), relaunch: noRelaunch })).toEqual({ handled: 1, remaining: 0 })
    expect((await jobs(db))[0]).toMatchObject({ status: 'done', attempts: 2 })
  })

  it('échec technique : deux tentatives puis « échec, réessayez » avec le message exact', async () => {
    const { db, classes, deps } = await setup(1)
    await requestCorrection(db, deps, classes[0].teacherId, classes[0].progressIds[0], 'propose')
    let studentRuns = 0
    const broken: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      studentRuns++
      throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true)
    }
    await drainQueue(db, { ...deps, run: broken }, { deadline: later(), relaunch: noRelaunch })
    expect(studentRuns).toBe(2)
    const [job] = await jobs(db)
    expect(job).toMatchObject({ status: 'failed', attempts: 2, error: 'La correction automatique a échoué, réessayez.' })
    expect(TECHNICAL_FAILURE).toBe('La correction automatique a échoué, réessayez.')
  })

  it('service indisponible malgré les nouveaux essais du client : traité comme un échec technique', async () => {
    const { db, classes, deps } = await setup(1)
    await requestCorrection(db, deps, classes[0].teacherId, classes[0].progressIds[0], 'propose')
    let calls = 0
    const busy: Deps['run'] = async (bytes, base, seeds) => {
      if (isSolution(bytes)) return fakeRun(bytes, base, seeds)
      calls++
      if (calls === 1) throw new RunnerError('Service d’exécution occupé, réessayez plus tard.', true, 503, true)
      return fakeRun(bytes, base, seeds)
    }
    await drainQueue(db, { ...deps, run: busy }, { deadline: later(), relaunch: noRelaunch })
    expect((await jobs(db))[0]).toMatchObject({ status: 'done', attempts: 2 }) // seconde tentative réussie
  })

  it('refus de l’IA : échec explicite tout de suite, sans nouvelle tentative', async () => {
    const { db, classes, deps } = await setup(1)
    await requestCorrection(db, deps, classes[0].teacherId, classes[0].progressIds[0], 'propose') // « Salut » : l'IA est nécessaire
    let grades = 0
    const refusing = { grade: async () => { grades++; return { ok: false as const, error: 'L’IA a refusé de corriger ce défi.' } } }
    await drainQueue(db, { ...deps, ai: () => refusing }, { deadline: later(), relaunch: noRelaunch })
    expect(grades).toBe(1)
    expect((await jobs(db))[0]).toMatchObject({ status: 'failed', attempts: 1, error: 'L’IA a refusé de corriger ce défi.' })
  })
})

describe('reprise des corrections bloquées', () => {
  it('« running » depuis 16 min : reprise et terminée ; depuis 5 min : laissée', async () => {
    const { db, classes, deps } = await setup(2)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const [a, b] = await jobs(db)
    const now = new Date()
    await db.update(autogradeJobs).set({ status: 'running', attempts: 1, startedAt: new Date(now.getTime() - 16 * 60_000).toISOString() }).where(eq(autogradeJobs.id, a.id))
    await db.update(autogradeJobs).set({ status: 'running', attempts: 1, startedAt: new Date(now.getTime() - 5 * 60_000).toISOString() }).where(eq(autogradeJobs.id, b.id))
    expect(await recoverStuck(db, now)).toBe(1)
    const after = new Map((await jobs(db)).map((j) => [j.id, j]))
    expect(after.get(a.id)).toMatchObject({ status: 'queued', startedAt: null })
    expect(after.get(b.id)?.status).toBe('running')
    await drainQueue(db, deps, { deadline: later(), relaunch: noRelaunch })
    expect((await jobs(db)).find((j) => j.id === a.id)).toMatchObject({ status: 'done', attempts: 2 })
  })

  it('bloquée une seconde fois (deux tentatives déjà faites) : échec avec le message exact', async () => {
    const { db, classes, deps } = await setup(1)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    const now = new Date()
    await db.update(autogradeJobs).set({ status: 'running', attempts: 2, startedAt: new Date(now.getTime() - 16 * 60_000).toISOString() })
    await recoverStuck(db, now)
    expect((await jobs(db))[0]).toMatchObject({ status: 'failed', error: 'La correction automatique a échoué, réessayez.' })
    expect(await runStatus(db, classes[0].teacherId, classes[0].classId)).toMatchObject({ failed: 1, finished: true })
  })

  it('reprend un job « waiting_ai » hérité de l’ancien fonctionnement par lots', async () => {
    const { db, classes, deps } = await setup(1)
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    await db.update(autogradeJobs).set({ status: 'waiting_ai', prepared: '{}' })
    await recoverStuck(db, new Date())
    expect((await jobs(db))[0]).toMatchObject({ status: 'queued', prepared: null })
  })
})

describe('relance depuis le suivi de l’état', () => {
  it('seulement s’il reste des copies en file, aucune en cours, et aucune prise depuis 10 s', async () => {
    const { db, classes, deps } = await setup(2)
    const now = new Date()
    expect(await needsDrain(db, now)).toBe(false) // rien en file
    await requestClassCorrection(db, deps, classes[0].teacherId, classes[0].classId, 'propose')
    expect(await needsDrain(db, now)).toBe(true)
    const [a] = await jobs(db)
    await db.update(autogradeJobs).set({ status: 'running', startedAt: now.toISOString() }).where(eq(autogradeJobs.id, a.id))
    expect(await needsDrain(db, now)).toBe(false) // une fonction travaille
    await db.update(autogradeJobs).set({ status: 'done', startedAt: new Date(now.getTime() - 3_000).toISOString() }).where(eq(autogradeJobs.id, a.id))
    expect(await needsDrain(db, now)).toBe(false) // une copie vient d'être prise : la fonction passe à la suivante
    expect(await needsDrain(db, new Date(now.getTime() + 11_000))).toBe(true)
  })
})
