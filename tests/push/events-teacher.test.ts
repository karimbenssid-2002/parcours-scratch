import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { classStudents, teachers } from '@/lib/db/schema'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, setAssignmentDue } from '@/lib/db/assignments'
import { recordSave } from '@/lib/db/progress'
import { createTeacherRequest } from '@/lib/db/teacher-requests'

// after() est capté : les rappels sont exécutés (et attendus) par le test.
const scheduled: (() => unknown)[] = []
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { scheduled.push(fn) } }))
const sendPush = vi.fn<(...a: unknown[]) => Promise<{ sent: number; removed: number; failed: number }>>(async () => ({ sent: 0, removed: 0, failed: 0 }))
vi.mock('@/lib/push/send', () => ({ sendPush: (...a: unknown[]) => sendPush(...a) }))
const holder: { db: Awaited<ReturnType<typeof testDb>> | null } = { db: null }
vi.mock('@/lib/db/client', () => ({ getDb: () => holder.db }))
vi.mock('@/lib/auth/session', () => ({ requireTeacher: async () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/email', () => ({ sendEmail: async () => {} }))

import { schedule } from '@/lib/push/schedule'
import { notifyAutoSubmissions, notifyNewActivities, notifySubmission, notifyTeacherRequest } from '@/lib/push/events'
import { closeOverdue } from '@/lib/deadlines/close'
import { submitDefi } from '@/lib/projects/service'
import { saveActivityAction } from '@/app/admin/(espace)/activites/actions'
import { requestTeacherAccess } from '@/app/admin/(auth)/actions'

const flush = async () => { while (scheduled.length) await scheduled.shift()!() }
const calls = () => sendPush.mock.calls.map((c) => ({
  ids: (c[1] as { id: string }[]).map((r) => r.id).sort(),
  msg: c[2] as { title: string; body: string; url: string; tag?: string },
}))
const prof = (db: Awaited<ReturnType<typeof testDb>>, n: string, role: 'prof' | 'admin' = 'prof') =>
  createTeacher(db, { email: `${n}@exemple.invalid`, username: n, firstName: n, lastName: 'Test', role })

beforeEach(() => {
  scheduled.length = 0
  sendPush.mockReset()
  sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 0 })
})

async function world() {
  const db = await testDb()
  holder.db = db
  const t1 = await prof(db, 'un'), t2 = await prof(db, 'deux'), t3 = await prof(db, 'trois')
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  const c1 = await createClass(db, t1.id, { name: 'A', level: '6' })
  const c2 = await createClass(db, t2.id, { name: 'B', level: '6' })
  const c3 = await createClass(db, t3.id, { name: 'C', level: '6' })
  for (const c of [c1, c2, c3]) await addAssignments(db, c.id, [a])
  const eleve = await createStudent(db, { email: 'Alice.Exemple@exemple.invalid' })
  await addEmailsToClass(db, c1.id, ['alice.exemple@exemple.invalid'])
  await addEmailsToClass(db, c2.id, [eleve.email])
  return { db, t1, t2, t3, a, c1, c2, c3, eleve }
}

describe('notifySubmission', () => {
  it('prévient les deux professeurs de l’élève, pas un autre', async () => {
    const { db, t1, t2, a, eleve } = await world()
    await recordSave(db, eleve.id, a, 'projets/x.sb3')
    expect(await submitDefi(db, eleve, a)).toEqual({ ok: true })
    await flush()
    const [c] = calls()
    expect(calls()).toHaveLength(1)
    expect(c.ids).toEqual([t1.id, t2.id].sort())
    const pid = c.msg.tag!.replace('copie-', '')
    expect(c.msg).toEqual({
      title: 'Parcours Scratch', body: `${eleve.firstName} ${eleve.lastName} a rendu Le serpent`,
      url: `/admin/revue/${pid}`, tag: `copie-${pid}`,
    })
  })

  it('un rendu qui échoue ne notifie personne', async () => {
    const { db, eleve, a } = await world()
    expect(await submitDefi(db, eleve, a)).toMatchObject({ ok: false })
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('sendPush qui lève : le rendu réussit quand même', async () => {
    const { db, eleve, a } = await world()
    await recordSave(db, eleve.id, a, 'projets/x.sb3')
    sendPush.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await submitDefi(db, eleve, a)).toEqual({ ok: true })
    await expect(flush()).resolves.toBeUndefined()
    await expect(notifySubmission(db, 'inconnu')).resolves.toBeUndefined()
  })
})

describe('destinataires d’une copie', () => {
  it('compare les e-mails sans tenir compte de la casse (ligne de classe insérée sans normalisation)', async () => {
    const { db, eleve, a } = await world()
    const t4 = await prof(db, 'quatre')
    const c4 = await createClass(db, t4.id, { name: 'D', level: '6' })
    await addAssignments(db, c4.id, [a])
    await db.insert(classStudents).values({ classId: c4.id, studentEmail: 'ALICE.Exemple@EXEMPLE.invalid' })
    await recordSave(db, eleve.id, a, 'projets/x.sb3')
    await submitDefi(db, eleve, a)
    await flush()
    expect(calls()[0].ids).toContain(t4.id)
    expect(calls()[0].ids).toHaveLength(3)
  })
})

describe('notifyAutoSubmissions', () => {
  it('une notification par professeur, au pluriel et au singulier', async () => {
    const db = await testDb()
    holder.db = db
    const t1 = await prof(db, 'un'), t2 = await prof(db, 'deux')
    const acts: string[] = []
    for (const n of ['A1', 'A2', 'A3']) {
      const { id } = await createActivity(db, { title: n })
      await setActivityStatus(db, id, 'published')
      acts.push(id)
    }
    const c1 = await createClass(db, t1.id, { name: 'A', level: '6' })
    const c2 = await createClass(db, t2.id, { name: 'B', level: '6' })
    await addAssignments(db, c1.id, acts)
    await addAssignments(db, c2.id, [acts[0]])
    const s1 = await createStudent(db, { email: 'e1@exemple.invalid' })
    const s2 = await createStudent(db, { email: 'e2@exemple.invalid' })
    await addEmailsToClass(db, c1.id, [s1.email, s2.email])
    await addEmailsToClass(db, c2.id, [s1.email])
    await notifyAutoSubmissions(db, [
      { studentId: s1.id, activityId: acts[0] }, { studentId: s1.id, activityId: acts[1] }, { studentId: s2.id, activityId: acts[2] },
    ])
    const bodies = new Map(calls().map((c) => [c.ids[0], c.msg]))
    expect(bodies.get(t1.id)).toEqual({ title: 'Parcours Scratch', body: '3 copies rendues automatiquement (date limite)', url: '/admin/a-valider' })
    expect(bodies.get(t2.id)!.body).toBe('1 copie rendue automatiquement (date limite)')
    expect(sendPush).toHaveBeenCalledTimes(2)
  })

  it('closeOverdue programme la notification des seules copies rendues avec travail', async () => {
    const { db, a, c1, c2, eleve } = await world()
    await setAssignmentDue(db, c1.id, a, '2026-10-14T17:00:00.000Z')
    await setAssignmentDue(db, c2.id, a, '2026-10-14T17:00:00.000Z')
    const sansTravail = await createStudent(db, { email: 'vide@exemple.invalid' })
    await addEmailsToClass(db, c1.id, [sansTravail.email])
    await recordSave(db, eleve.id, a, 'projets/x.sb3')
    expect(await closeOverdue(db, new Date('2026-10-14T18:00:00.000Z'))).toBe(2)
    await flush()
    expect(calls()).toHaveLength(2) // les deux professeurs de l’élève ; la copie sans travail n’est pas annoncée
    for (const c of calls()) expect(c.msg.body).toBe('1 copie rendue automatiquement (date limite)')
  })
  it('un second closeOverdue sur les mêmes copies n’envoie rien', async () => {
    const { db, a, c1, c2, eleve } = await world()
    await setAssignmentDue(db, c1.id, a, '2026-10-14T17:00:00.000Z')
    await setAssignmentDue(db, c2.id, a, '2026-10-14T17:00:00.000Z')
    await recordSave(db, eleve.id, a, 'projets/x.sb3')
    const at = new Date('2026-10-14T18:00:00.000Z')
    expect(await closeOverdue(db, at)).toBe(1)
    await flush()
    sendPush.mockClear()
    expect(await closeOverdue(db, at)).toBe(0)
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('par closeOverdue : 3 copies d’un professeur et 1 d’un autre donnent deux notifications', async () => {
    const db = await testDb()
    holder.db = db
    const t1 = await prof(db, 'un'), t2 = await prof(db, 'deux')
    const acts: string[] = []
    for (const n of ['A1', 'A2', 'A3']) {
      const { id } = await createActivity(db, { title: n })
      await setActivityStatus(db, id, 'published')
      acts.push(id)
    }
    const c1 = await createClass(db, t1.id, { name: 'A', level: '6' })
    const c2 = await createClass(db, t2.id, { name: 'B', level: '6' })
    await addAssignments(db, c1.id, acts)
    await addAssignments(db, c2.id, [acts[0]])
    const s1 = await createStudent(db, { email: 'e1@exemple.invalid' })
    const s2 = await createStudent(db, { email: 'e2@exemple.invalid' })
    await addEmailsToClass(db, c1.id, [s1.email])
    await addEmailsToClass(db, c2.id, [s2.email])
    for (const a of acts) await setAssignmentDue(db, c1.id, a, '2026-10-14T17:00:00.000Z')
    await setAssignmentDue(db, c2.id, acts[0], '2026-10-14T17:00:00.000Z')
    for (const a of acts) await recordSave(db, s1.id, a, `projets/${a}.sb3`)
    await recordSave(db, s2.id, acts[0], 'projets/s2.sb3')
    await closeOverdue(db, new Date('2026-10-14T18:00:00.000Z'))
    await flush()
    const byTeacher = new Map(calls().map((c) => [c.ids[0], c.msg]))
    expect(calls()).toHaveLength(2)
    expect(byTeacher.get(t1.id)).toEqual({ title: 'Parcours Scratch', body: '3 copies rendues automatiquement (date limite)', url: '/admin/a-valider' })
    expect(byTeacher.get(t2.id)).toEqual({ title: 'Parcours Scratch', body: '1 copie rendue automatiquement (date limite)', url: '/admin/a-valider' })
  })
})

describe('notifyNewActivities', () => {
  it('brouillon vers publié : tous les enseignants actifs, pas le désactivé ; publié vers publié : rien', async () => {
    const db = await testDb()
    holder.db = db
    const t1 = await prof(db, 'un'), off = await prof(db, 'off'), adm = await prof(db, 'adm', 'admin')
    await db.update(teachers).set({ isActive: false }).where(eq(teachers.id, off.id))
    const { id } = await createActivity(db, { title: 'Titre' })
    const fd = new FormData()
    fd.set('title', 'Titre')
    fd.set('status', 'published')
    await saveActivityAction(id, null, fd)
    await flush()
    const byId = new Map(calls().map((c) => [c.ids[0], c]))
    expect(calls()).toHaveLength(2)
    expect(byId.get(adm.id)!.msg).toEqual({ title: 'Parcours Scratch', body: 'Nouvelle activité : Titre', url: `/admin/activites/${id}` })
    expect(byId.get(t1.id)!.msg).toEqual({ title: 'Parcours Scratch', body: 'Nouvelle activité : Titre', url: `/admin/apercu/${id}` })
    sendPush.mockClear()
    await saveActivityAction(id, null, fd)
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
    // publié → brouillon → publié : toujours rien
    const draft = new FormData()
    draft.set('title', 'Titre')
    draft.set('status', 'draft')
    await saveActivityAction(id, null, draft)
    await saveActivityAction(id, null, fd)
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('deux enregistrements simultanés : une seule annonce', async () => {
    const db = await testDb()
    holder.db = db
    await prof(db, 'un')
    const { id } = await createActivity(db, { title: 'Titre' })
    const fd = new FormData()
    fd.set('title', 'Titre')
    fd.set('status', 'published')
    await Promise.all([saveActivityAction(id, null, fd), saveActivityAction(id, null, fd)])
    await flush()
    expect(sendPush).toHaveBeenCalledTimes(1)
  })

  it('plusieurs activités : message groupé', async () => {
    const db = await testDb()
    const t = await prof(db, 'un'), adm = await prof(db, 'adm', 'admin')
    const a = await createActivity(db, { title: 'A' }), b = await createActivity(db, { title: 'B' })
    await notifyNewActivities(db, [a.id, b.id])
    const byId = new Map(calls().map((c) => [c.ids[0], c]))
    expect(byId.get(t.id)!.msg).toMatchObject({ body: '2 nouvelles activités', url: '/admin' })
    expect(byId.get(adm.id)!.msg).toMatchObject({ body: '2 nouvelles activités', url: '/admin/activites' })
  })
})

describe('notifyTeacherRequest', () => {
  it('demande créée : l’admin est prévenu ; doublon : rien', async () => {
    const db = await testDb()
    holder.db = db
    const adm = await prof(db, 'adm', 'admin')
    await prof(db, 'simple')
    const fd = new FormData()
    fd.set('email', 'zoe.fictive@malraux-rabat.org')
    await requestTeacherAccess(null, fd)
    await flush()
    expect(calls()).toHaveLength(1)
    expect(calls()[0].ids).toEqual([adm.id])
    expect(calls()[0].msg).toEqual({ title: 'Parcours Scratch', body: 'Nouvelle demande de compte enseignant : Zoe Fictive', url: '/admin/demandes' })
    sendPush.mockClear()
    await requestTeacherAccess(null, fd)
    await flush()
    expect(sendPush).not.toHaveBeenCalled()
    expect(await createTeacherRequest(db, 'zoe.fictive@malraux-rabat.org')).toBe('duplicate')
    await notifyTeacherRequest(db, 'inconnu')
  })
})

describe('schedule', () => {
  it('absorbe une erreur levée avant sendPush', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => schedule(async () => { throw new Error('avant sendPush') })).not.toThrow()
    await expect(flush()).resolves.toBeUndefined()
  })
})
