import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { getProgress, recordSave, submitProgress } from '@/lib/db/progress'
import { autogradeJobs, autogradeRunnerCalls, appSettings } from '@/lib/db/schema'
import { autogradeEffort, monthlyCap, monthlyUsage, quotaBlock, quotaState, QUOTA_MESSAGE, saveEffort, saveMonthlyCap, saveAutogradeSettings, setSolution } from '@/lib/db/autograde'
import { timedRun } from '@/lib/db/autograde-runs'
import { writeStored } from '@/lib/storage/files'
import { fakeClient } from '@/lib/autograde/ai'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'
import { requestClassCorrection, requestCorrection, type Deps } from '@/lib/autograde/service'
import { drainQueue } from '@/lib/autograde/queue'
import { makeSb3 } from './fixtures'

let role: 'admin' | 'prof' = 'admin'
vi.mock('@/lib/auth/session', () => ({
  requireTeacher: async (opts: { role?: 'admin' } = {}) => {
    if (opts.role === 'admin' && role !== 'admin') throw new Error('REDIRECT')
    return { id: 'prof-essai', role }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
let current: DB
vi.mock('@/lib/db/client', () => ({ getDb: () => current }))

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'autograde-quota-'))
  role = 'admin'
})

const say = (text: string) => makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: text }]]])
const SOLUTION_BYTES = say('Bonjour')
// Même faux exécuteur que tests/autograde/queue.test.ts : le projet est lu, ce que dit le lutin donne le relevé.
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

const letters = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))

async function setup(pupils: number) {
  const db = await testDb()
  current = db
  const { id: activityId } = await createActivity(db, { title: 'Bonjour' })
  await setActivityStatus(db, activityId, 'published')
  await saveAutogradeSettings(db, activityId, { criteria: ['Le lutin dit Bonjour'], answers: [], keys: [], durationMs: 2000 })
  await writeStored(`solutions/${activityId}.sb3`, SOLUTION_BYTES)
  await setSolution(db, activityId, `solutions/${activityId}.sb3`, 'sb3')
  const prof = await createTeacher(db, { email: 'ines.essai@malraux-rabat.org', username: 'ines.essai', firstName: 'Prof', lastName: 'Essai', role: 'prof' })
  const cls = await createClass(db, prof.id, { name: '5e A', level: '5' })
  await addAssignments(db, cls.id, [activityId])
  const progressIds: string[] = []
  for (let i = 0; i < pupils; i++) {
    const s = await createStudent(db, { email: `eleve${letters(i)}.inventee@malraux-rabat.org` })
    await addEmailsToClass(db, cls.id, [s.email])
    const rel = `projets/${s.id}/p.sb3`
    await writeStored(rel, say('Salut'))
    await recordSave(db, s.id, activityId, rel)
    await submitProgress(db, s.id, activityId)
    progressIds.push((await getProgress(db, s.id, activityId))!.id)
  }
  const client = fakeClient()
  const deps: Deps = { run: fakeRun, runner: 'remote', ai: () => client, now: () => new Date('2026-11-15T10:00:00Z') }
  return { db, deps, teacherId: prof.id, classId: cls.id, progressIds }
}

const call = (db: DB, at: string, kind: 'eleve' | 'reference' | 'test' = 'eleve', durationMs = 1000) =>
  db.insert(autogradeRunnerCalls).values({ at, kind, durationMs })
const NOW = new Date('2026-11-15T10:00:00Z')
const drain = (db: DB, deps: Deps) => drainQueue(db, deps, { deadline: Date.now() + 60_000, relaunch: async () => true })

describe('plafond mensuel : comptage', () => {
  it('compte toutes les exécutions du mois civil UTC, de tout type, et ignore les autres mois', async () => {
    const db = await testDb()
    await call(db, '2026-11-01T00:00:00.000Z', 'eleve', 2000)
    await call(db, '2026-11-14T08:00:00.000Z', 'reference', 3000)
    await call(db, '2026-11-30T23:59:59.999Z', 'test', 500)
    await call(db, '2026-10-31T23:59:59.999Z') // mois précédent
    await call(db, '2026-12-01T00:00:00.000Z') // mois suivant
    expect(await monthlyUsage(db, NOW)).toEqual({ used: 3, cap: 8000, durationMs: 5500 })
  })
  it('le plafond par défaut est 8000 et se lit dans le réglage', async () => {
    const db = await testDb()
    expect(await monthlyCap(db)).toBe(8000)
    expect(await saveMonthlyCap(db, '12')).toEqual({ ok: true })
    expect((await monthlyUsage(db, NOW)).cap).toBe(12)
  })
  it('timedRun enregistre une exécution « test » du service distant, rien en local', async () => {
    const db = await testDb()
    const base = { answers: [], keys: [], durationMs: 2000 }
    await timedRun(db, { run: fakeRun, runner: 'remote' }, 'test', null, SOLUTION_BYTES, base)
    await timedRun(db, { run: fakeRun, runner: 'local' }, 'test', null, SOLUTION_BYTES, base)
    expect((await db.select().from(autogradeRunnerCalls)).map((r) => r.kind)).toEqual(['test'])
  })
})

describe('plafond mensuel : réglage', () => {
  it('accepte les entiers de 0 à 100 000 et refuse le reste', async () => {
    const db = await testDb()
    for (const ok of ['0', '8000', '100000']) expect(await saveMonthlyCap(db, ok)).toEqual({ ok: true })
    for (const bad of ['-1', '100001', '1.5', 'abc', '', ' ', '1e3', '12 ']) expect(await saveMonthlyCap(db, bad)).toMatchObject({ ok: false })
    expect(await monthlyCap(db)).toBe(100000)
  })
  it('une valeur illisible en base retombe sur 8000', async () => {
    const db = await testDb()
    await db.insert(appSettings).values({ key: 'autograde_monthly_cap', value: 'illisible' })
    expect(await monthlyCap(db)).toBe(8000)
  })
  it('un enseignant non administrateur ne peut pas changer le plafond', async () => {
    const db = await testDb()
    current = db
    const { setMonthlyCapAction } = await import('@/app/admin/(espace)/correction/actions')
    role = 'prof'
    const fd = new FormData(); fd.set('cap', '50')
    await expect(setMonthlyCapAction(null, fd)).rejects.toThrow('REDIRECT')
    expect(await monthlyCap(db)).toBe(8000)
    role = 'admin'
    expect(await setMonthlyCapAction(null, fd)).toEqual({ success: 'Plafond enregistré.' })
    expect(await monthlyCap(db)).toBe(50)
    const bad = new FormData(); bad.set('cap', '-4')
    expect(await setMonthlyCapAction(null, bad)).toEqual({ error: 'Valeur refusée : un entier entre 0 et 100 000.' })
    expect(await monthlyCap(db)).toBe(50)
  })
})

describe('plafond mensuel : demandes', () => {
  it('cap 3 et 3 exécutions ce mois : une nouvelle demande est refusée avec le message exact', async () => {
    const { db, deps, teacherId, progressIds } = await setup(1)
    await saveMonthlyCap(db, '3')
    for (let i = 0; i < 3; i++) await call(db, '2026-11-02T10:00:00.000Z')
    const r = await requestCorrection(db, deps, teacherId, progressIds[0], 'propose')
    expect(r).toEqual({ ok: false, error: 'Quota mensuel de corrections automatiques atteint : correction manuelle uniquement jusqu’au mois prochain.' })
    expect(QUOTA_MESSAGE).toBe(r.ok ? '' : r.error)
    expect(await db.select().from(autogradeJobs)).toHaveLength(0)
  })
  it('les exécutions du mois précédent sont ignorées', async () => {
    const { db, deps, teacherId, progressIds } = await setup(1)
    await saveMonthlyCap(db, '1')
    await call(db, '2026-10-30T10:00:00.000Z')
    expect(await requestCorrection(db, deps, teacherId, progressIds[0], 'propose')).toMatchObject({ ok: true })
  })
  it('une demande qui reste dans le plafond passe', async () => {
    const { db, deps, teacherId, progressIds } = await setup(1)
    await saveMonthlyCap(db, '3')
    await call(db, '2026-11-02T10:00:00.000Z'); await call(db, '2026-11-02T10:00:00.000Z')
    expect(await requestCorrection(db, deps, teacherId, progressIds[0], 'propose')).toMatchObject({ ok: true })
  })
  it('une classe qui dépasserait le plafond est refusée en entier, même message', async () => {
    const { db, deps, teacherId, classId } = await setup(4)
    await saveMonthlyCap(db, '5')
    await call(db, '2026-11-02T10:00:00.000Z'); await call(db, '2026-11-02T10:00:00.000Z')
    expect(await requestClassCorrection(db, deps, teacherId, classId, 'propose')).toEqual({ ok: false, error: QUOTA_MESSAGE })
    expect(await db.select().from(autogradeJobs)).toHaveLength(0)
    await saveMonthlyCap(db, '6')
    expect(await requestClassCorrection(db, deps, teacherId, classId, 'propose')).toMatchObject({ ok: true, count: 4 })
  })
  it('les copies en file comptent : cap 10, 5 utilisées, une classe de 4 en file, une demande de 2 est refusée', async () => {
    const { db, deps, teacherId, classId, progressIds } = await setup(6)
    await saveMonthlyCap(db, '10')
    for (let i = 0; i < 5; i++) await call(db, '2026-11-02T10:00:00.000Z')
    // 4 copies de la classe en file (une par défi), les 2 autres restent à demander.
    for (const id of progressIds.slice(0, 4)) expect(await requestCorrection(db, deps, teacherId, id, 'propose')).toMatchObject({ ok: true })
    expect(await quotaState(db, NOW)).toMatchObject({ used: 5, active: 4, cap: 10, remaining: 1 })
    expect(quotaBlock({ remaining: 1 }, 2)).toBe(QUOTA_MESSAGE)
    expect(await requestClassCorrection(db, deps, teacherId, classId, 'propose')).toEqual({ ok: false, error: QUOTA_MESSAGE })
    expect(await requestCorrection(db, deps, teacherId, progressIds[4], 'propose')).toMatchObject({ ok: true })
    expect(await requestCorrection(db, deps, teacherId, progressIds[5], 'propose')).toEqual({ ok: false, error: QUOTA_MESSAGE })
  })
  it('deux demandes simultanées qui tiennent seules mais pas ensemble : une seule est acceptée', async () => {
    // PGlite n'a qu'une connexion : les transactions passent l'une après l'autre ; l'exclusion elle-même repose sur
    // pg_advisory_xact_lock (QUOTA_LOCK), vérifié par la relecture du plafond à l'intérieur de la transaction.
    const { db, deps, teacherId, progressIds } = await setup(2)
    await saveMonthlyCap(db, '1')
    const results = await Promise.all(progressIds.map((id) => requestCorrection(db, deps, teacherId, id, 'propose')))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: QUOTA_MESSAGE }])
    expect(await db.select().from(autogradeJobs)).toHaveLength(1)
  })
  it('les copies déjà en file quand le plafond est atteint finissent', async () => {
    const { db, deps, teacherId, classId } = await setup(3)
    await saveMonthlyCap(db, '3')
    expect(await requestClassCorrection(db, deps, teacherId, classId, 'propose')).toMatchObject({ ok: true, count: 3 })
    // Le plafond est atteint (par exemple par une autre classe) pendant que la file attend.
    for (let i = 0; i < 5; i++) await call(db, deps.now().toISOString())
    await drain(db, deps)
    expect((await db.select().from(autogradeJobs)).map((j) => j.status)).toEqual(['done', 'done', 'done'])
  })
})

describe('niveau de réflexion', () => {
  it('vaut « low » par défaut, ou si la valeur en base est inconnue (xhigh, max…)', async () => {
    const db = await testDb()
    expect(await autogradeEffort(db)).toBe('low')
    for (const v of ['xhigh', 'max', 'inconnue']) {
      await db.insert(appSettings).values({ key: 'autograde_effort', value: v }).onConflictDoUpdate({ target: appSettings.key, set: { value: v } })
      expect(await autogradeEffort(db)).toBe('low')
    }
  })
  it('accepte low, medium, high ; refuse xhigh, max et le reste', async () => {
    const db = await testDb()
    expect(await saveEffort(db, 'medium')).toEqual({ ok: true })
    expect(await autogradeEffort(db)).toBe('medium')
    expect(await saveEffort(db, 'high')).toEqual({ ok: true })
    for (const bad of ['xhigh', 'max', '', 'LOW', 'moyen']) expect(await saveEffort(db, bad)).toMatchObject({ ok: false })
    expect(await autogradeEffort(db)).toBe('high')
    expect((await db.select().from(appSettings).where(eq(appSettings.key, 'autograde_effort')))[0].value).toBe('high')
  })
  it('seul l’administrateur peut le changer', async () => {
    const db = await testDb()
    current = db
    const { setEffortAction } = await import('@/app/admin/(espace)/correction/actions')
    const fd = new FormData(); fd.set('effort', 'high')
    role = 'prof'
    await expect(setEffortAction(null, fd)).rejects.toThrow('REDIRECT')
    expect(await autogradeEffort(db)).toBe('low')
    role = 'admin'
    expect(await setEffortAction(null, fd)).toMatchObject({ success: expect.any(String) })
    expect(await autogradeEffort(db)).toBe('high')
    const bad = new FormData(); bad.set('effort', 'max')
    expect(await setEffortAction(null, bad)).toEqual({ error: 'Niveau inconnu.' })
    expect(await autogradeEffort(db)).toBe('high')
  })
  it('la correction envoie le niveau choisi à Claude', async () => {
    const { db, deps, teacherId, progressIds } = await setup(1)
    await saveEffort(db, 'high')
    const seen: unknown[] = []
    const client = { grade: async (m: never, r: never, effort?: unknown) => { seen.push(effort); return fakeClient().grade(m, r) } }
    const d = { ...deps, ai: () => client }
    await requestCorrection(db, d, teacherId, progressIds[0], 'propose')
    await drain(db, d)
    expect(seen).toEqual(['high'])
  })
})
