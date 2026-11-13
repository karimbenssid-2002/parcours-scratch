import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import { makeSb3 } from '../autograde/fixtures'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, addAssignmentsDetailed } from '@/lib/db/assignments'
import { getProgress, recordSave, submitProgress } from '@/lib/db/progress'
import { saveAutogradeSettings, setSolution } from '@/lib/db/autograde'
import { writeStored } from '@/lib/storage/files'
import { fakeClient } from '@/lib/autograde/ai'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'
import { requestCorrection, pendingProposals, type Deps } from '@/lib/autograde/service'
import { drainQueue } from '@/lib/autograde/queue'
import { decide } from '@/lib/review/service'
import { classStudents } from '@/lib/db/schema'
import { addToTheme, createTheme } from '@/lib/db/progressions'

const scheduled: (() => unknown)[] = []
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { scheduled.push(fn) } }))
const sendPush = vi.fn<(...a: unknown[]) => Promise<{ sent: number; removed: number; failed: number }>>(async () => ({ sent: 0, removed: 0, failed: 0 }))
vi.mock('@/lib/push/send', () => ({ sendPush: (...a: unknown[]) => sendPush(...a) }))
const holder: { db: Awaited<ReturnType<typeof testDb>> | null } = { db: null }
vi.mock('@/lib/db/client', () => ({ getDb: () => holder.db }))
const auth: { teacher: { id: string } | null } = { teacher: null }
vi.mock('@/lib/auth/session', () => ({ requireTeacher: async () => auth.teacher }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { addAssignmentsAction, giveProgressionAction, giveThemesAction, saveAssignmentOrderAction, setAssignmentDueAction, toggleSolutionAction } from '@/app/admin/(espace)/classes/[classId]/assignment-actions'
import { decideAction } from '@/app/admin/(espace)/revue/[progressId]/actions'

const flush = async () => { while (scheduled.length) await scheduled.shift()!() }
const calls = () => sendPush.mock.calls.map((c) => ({
  recipients: c[1] as { kind: string; id: string }[],
  msg: c[2] as { title: string; body: string; url: string },
}))

beforeEach(() => {
  scheduled.length = 0
  sendPush.mockReset()
  sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 0 })
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-eleves-'))
})

async function world(published = 6) {
  const db = await testDb()
  holder.db = db
  const prof = await createTeacher(db, { email: 'p@exemple.invalid', username: 'p', firstName: 'P', lastName: 'Test', role: 'prof' })
  auth.teacher = { id: prof.id }
  const acts: string[] = []
  for (let i = 1; i <= published; i++) {
    const { id } = await createActivity(db, { title: `Défi ${i}` })
    await setActivityStatus(db, id, 'published')
    acts.push(id)
  }
  const c1 = await createClass(db, prof.id, { name: 'A', level: '6' })
  const c2 = await createClass(db, prof.id, { name: 'B', level: '6' })
  const alice = await createStudent(db, { email: 'Alice@exemple.invalid' })
  const bob = await createStudent(db, { email: 'bob@exemple.invalid' })
  await addEmailsToClass(db, c1.id, ['alice@exemple.invalid', 'sans-compte@exemple.invalid'])
  await addEmailsToClass(db, c2.id, [bob.email])
  return { db, prof, acts, c1, c2, alice, bob }
}

describe('défis ajoutés', () => {
  it('un thème réel : une notification aux élèves de la classe, avec les seuls défis insérés', async () => {
    const { db, acts, c1, alice } = await world()
    const t = await createTheme(db, { level: '6', title: 'Un' })
    for (const id of acts.slice(0, 3)) await addToTheme(db, t.id, id, { step: 'decouvrir', difficulty: 1, why: '' })
    await addAssignments(db, c1.id, [acts[0]])
    expect(await giveThemesAction(c1.id, [t.id])).toEqual({ success: '2 défis ajoutés.' })
    await flush()
    expect(calls()).toEqual([{ recipients: [{ kind: 'student', id: alice.id }], msg: { title: 'Parcours Scratch', body: '2 nouveaux défis à faire', url: '/' } }])
  })

  it('une progression réelle : une notification, thèmes facultatifs exclus ; rien si tout est déjà donné', async () => {
    const { db, acts, c1, alice } = await world()
    const t = await createTheme(db, { level: '6', title: 'Un' })
    const opt = await createTheme(db, { level: '6', title: 'Projets', optional: true })
    await addToTheme(db, t.id, acts[0], { step: 'decouvrir', difficulty: 1, why: '' })
    await addToTheme(db, t.id, acts[1], { step: 'entrainer', difficulty: 1, why: '' })
    await addToTheme(db, opt.id, acts[2], { step: 'approfondir', difficulty: 1, why: '' })
    expect(await giveProgressionAction(c1.id, '6')).toEqual({ success: '2 défis ajoutés.' })
    await flush()
    expect(calls()).toEqual([{ recipients: [{ kind: 'student', id: alice.id }], msg: { title: 'Parcours Scratch', body: '2 nouveaux défis à faire', url: '/' } }])
    sendPush.mockClear()
    await giveProgressionAction(c1.id, '6')
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('deux comptes dans la classe, un élève d’une autre classe : liste exacte', async () => {
    const { db, acts, c1, alice, bob } = await world()
    const carl = await createStudent(db, { email: 'carl@exemple.invalid' })
    await addEmailsToClass(db, c1.id, [carl.email])
    await addAssignmentsAction(c1.id, [acts[0]])
    await flush()
    expect(calls()).toHaveLength(1)
    expect(calls()[0].recipients.map((r) => r.id).sort()).toEqual([alice.id, carl.id].sort())
    expect(calls()[0].recipients.map((r) => r.id)).not.toContain(bob.id)
  })

  it('6 défis dont 1 déjà présent : une notification « 5 nouveaux défis à faire » aux élèves de la classe seulement', async () => {
    const { db, acts, c1, alice } = await world()
    await addAssignments(db, c1.id, [acts[0]])
    expect(await addAssignmentsAction(c1.id, acts)).toEqual({ success: '5 défis ajoutés.' })
    await flush()
    expect(calls()).toEqual([{ recipients: [{ kind: 'student', id: alice.id }], msg: { title: 'Parcours Scratch', body: '5 nouveaux défis à faire', url: '/' } }])
  })

  it('un seul défi : titre et lien du défi', async () => {
    const { acts, c1, alice } = await world()
    await addAssignmentsAction(c1.id, [acts[2]])
    await flush()
    expect(calls()).toEqual([{ recipients: [{ kind: 'student', id: alice.id }], msg: { title: 'Parcours Scratch', body: 'Nouveau défi à faire : Défi 3', url: `/defis/${acts[2]}` } }])
  })

  it('rien si rien n’est ajouté ni pour un brouillon ; adresse de classe comparée sans la casse', async () => {
    const { db, acts, c1, c2, bob } = await world()
    const { id: draft } = await createActivity(db, { title: 'Brouillon' })
    await addAssignmentsAction(c1.id, [draft])
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
    await addAssignmentsAction(c1.id, [acts[0]])
    await flush()
    sendPush.mockClear()
    await addAssignmentsAction(c1.id, [acts[0]])
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
    await db.insert(classStudents).values({ classId: c2.id, studentEmail: 'BOB@Exemple.invalid' })
    await addAssignmentsAction(c2.id, [acts[1]])
    await flush()
    expect(calls().flatMap((c) => c.recipients)).toEqual([{ kind: 'student', id: bob.id }])
  })

  it('réordonner, changer l’échéance, partager un corrigé : rien', async () => {
    const { db, acts, c1 } = await world()
    await addAssignments(db, c1.id, acts.slice(0, 2))
    expect(await saveAssignmentOrderAction(c1.id, [acts[1], acts[0]])).toEqual({})
    expect(await setAssignmentDueAction(c1.id, acts[0], '2030-01-10T10:00')).not.toHaveProperty('error')
    await toggleSolutionAction(c1.id, acts[0], true)
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('addAssignmentsDetailed renvoie les seuls ids insérés ; giveThemesAction sans thème : rien', async () => {
    const { db, acts, c1 } = await world()
    expect(await addAssignmentsDetailed(db, c1.id, [acts[0], acts[1]])).toEqual([acts[0], acts[1]])
    expect(await addAssignmentsDetailed(db, c1.id, [acts[1], acts[2]])).toEqual([acts[2]])
    await giveThemesAction(c1.id, ['inconnu'])
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })
})

const say = (text: string) => makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: text }]]])
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

/** Un élève ayant rendu son défi (Bonjour correct ou non), dans la classe du professeur. */
async function submitted(kind: 'same' | 'different') {
  const db = await testDb()
  holder.db = db
  const prof = await createTeacher(db, { email: 'p@exemple.invalid', username: 'p', firstName: 'P', lastName: 'Test', role: 'prof' })
  auth.teacher = { id: prof.id }
  const { id: activityId } = await createActivity(db, { title: 'Bonjour' })
  await setActivityStatus(db, activityId, 'published')
  await saveAutogradeSettings(db, activityId, { criteria: ['Le lutin dit Bonjour'], answers: [], keys: [], durationMs: 2000 })
  await writeStored(`solutions/${activityId}.sb3`, say('Bonjour'))
  await setSolution(db, activityId, `solutions/${activityId}.sb3`, 'sb3')
  const cls = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, cls.id, [activityId])
  const s = await createStudent(db, { email: 'alice.exemple@exemple.invalid' })
  await addEmailsToClass(db, cls.id, [s.email])
  const rel = `projets/${s.id}/p.sb3`
  await writeStored(rel, say(kind === 'same' ? 'Bonjour' : 'Salut'))
  await recordSave(db, s.id, activityId, rel)
  await submitProgress(db, s.id, activityId)
  const progressId = (await getProgress(db, s.id, activityId))!.id
  const deps: Deps = { run: fakeRun, runner: 'remote', ai: () => fakeClient(), now: () => new Date() }
  const drain = () => drainQueue(db, deps, { deadline: Date.now() + 60_000, relaunch: async () => true })
  return { db, prof, activityId, student: s, progressId, deps, drain }
}
const studentCalls = () => calls().filter((c) => c.recipients[0]?.kind === 'student')

describe('retours', () => {
  it('décision de l’enseignant : l’élève est prévenu', async () => {
    const { db, prof, progressId, student, activityId } = await submitted('different')
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque' })).toEqual({ ok: true })
    await flush()
    expect(calls()).toEqual([{ recipients: [{ kind: 'student', id: student.id }], msg: { title: 'Parcours Scratch', body: 'Nouveau retour sur Bonjour', url: `/defis/${activityId}` } }])
  })

  it('décision refusée : rien', async () => {
    const { db, prof, progressId } = await submitted('different')
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: '' })).toMatchObject({ ok: false })
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('« envoyer directement » : une seule notification', async () => {
    const { db, prof, progressId, drain, deps } = await submitted('different')
    await requestCorrection(db, deps, prof.id, progressId, 'send')
    await drain()
    await flush()
    expect(studentCalls()).toHaveLength(1)
    expect(studentCalls()[0].msg.body).toBe('Nouveau retour sur Bonjour')
  })

  it('« proposer » : rien ; l’enseignant envoie la proposition : une notification', async () => {
    const { db, prof, progressId, drain, deps } = await submitted('same')
    await requestCorrection(db, deps, prof.id, progressId, 'propose')
    await drain()
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
    const proposal = (await pendingProposals(db, [progressId])).get(progressId)!
    const fd = new FormData()
    fd.set('decision', proposal.proposal.decision)
    fd.set('comment', proposal.proposal.comment)
    fd.set('autogradeJobId', proposal.jobId)
    await expect(decideAction(progressId, null, null, fd)).rejects.toThrow('redirect')
    await flush()
    expect(calls()).toHaveLength(1)
    expect(studentCalls()).toHaveLength(1)
  })

  it('décision modifiée (nouvelle ligne visible) : l’élève est prévenu de nouveau', async () => {
    const { db, prof, progressId, student, activityId } = await submitted('different')
    await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque' })
    await submitProgress(db, student.id, activityId)
    await decide(db, prof.id, progressId, { decision: 'validated', comment: '' })
    await flush()
    expect(studentCalls()).toHaveLength(2)
  })

  it('sendPush qui lève : la décision réussit quand même', async () => {
    const { db, prof, progressId } = await submitted('different')
    sendPush.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'x' })).toEqual({ ok: true })
    await expect(flush()).resolves.toBeUndefined()
  })
})
