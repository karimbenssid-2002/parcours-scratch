import { describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, setAssignmentDue } from '@/lib/db/assignments'
import { getProgress, recordSave, submitProgress } from '@/lib/db/progress'
import { progress } from '@/lib/db/schema'
import { closeOverdue, GRACE_MS } from '@/lib/deadlines/close'
import { countUnseenNotices, listUnseenNotices, markNoticeSeen } from '@/lib/deadlines/notices'
import { eq } from 'drizzle-orm'

const DUE = '2026-10-14T17:00:00.000Z'
const after = (ms: number) => new Date(Date.parse(DUE) + ms)

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, c.id, [a])
  await setAssignmentDue(db, c.id, a, DUE)
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
  const farid = await createStudent(db, { email: 'farid.fictif@malraux-rabat.org', passwordHash: 'h' })
  await addEmailsToClass(db, c.id, [alice.email, farid.email])
  return { db, prof, a, c, alice, farid }
}

describe('rendu automatique', () => {
  it('ne fait rien avant échéance + marge', async () => {
    const { db } = await setup()
    expect(await closeOverdue(db, after(GRACE_MS - 1))).toBe(0)
  })

  it('rend un travail sauvegardé et marque « Non rendu » sans travail, une seule fois', async () => {
    const { db, prof, a, alice, farid } = await setup()
    await recordSave(db, alice.id, a, 'projets/l.sb3')
    expect(await closeOverdue(db, after(GRACE_MS))).toBe(2)
    expect(await closeOverdue(db, after(GRACE_MS + 60_000))).toBe(0)
    const l = (await getProgress(db, alice.id, a))!
    expect(l).toMatchObject({ status: 'submitted', submittedAt: DUE, closedDueAt: DUE })
    expect(l.autoSubmittedAt).not.toBeNull()
    expect((await getProgress(db, farid.id, a))!).toMatchObject({ status: 'not_submitted', closedDueAt: DUE })
    const notices = await listUnseenNotices(db, prof.id)
    expect(notices.map((n) => [n.studentName, n.kind, n.classNames]).sort()).toEqual([
      ['Alice Exemple', 'auto_submitted', '6e A'], ['Farid Fictif', 'not_submitted', '6e A'],
    ])
  })

  it('ne touche pas à un défi déjà envoyé ou validé', async () => {
    const { db, prof, a, alice, farid } = await setup()
    await recordSave(db, alice.id, a, 'projets/l.sb3')
    await submitProgress(db, alice.id, a)
    await recordSave(db, farid.id, a, 'projets/o.sb3')
    await db.update(progress).set({ status: 'validated' }).where(eq(progress.studentId, farid.id))
    expect(await closeOverdue(db, after(GRACE_MS))).toBe(0)
    expect((await getProgress(db, alice.id, a))!.autoSubmittedAt).toBeNull()
    expect(await countUnseenNotices(db, prof.id)).toBe(0)
  })

  it('rend à nouveau après une décision « presque réussi » prise avant l’échéance', async () => {
    const { db, a, alice } = await setup()
    await recordSave(db, alice.id, a, 'projets/l.sb3')
    await db.update(progress).set({ status: 'almost' }).where(eq(progress.studentId, alice.id))
    await closeOverdue(db, after(GRACE_MS))
    expect((await getProgress(db, alice.id, a))!.status).toBe('submitted')
  })

  it('ne rend pas deux fois : une décision « presque réussi » après l’échéance laisse l’élève travailler', async () => {
    const { db, a, alice } = await setup()
    await recordSave(db, alice.id, a, 'projets/l.sb3')
    await closeOverdue(db, after(GRACE_MS))
    await db.update(progress).set({ status: 'almost' }).where(eq(progress.studentId, alice.id))
    expect(await closeOverdue(db, after(GRACE_MS * 10))).toBe(0)
    expect((await getProgress(db, alice.id, a))!.status).toBe('almost')
  })

  it('« only » sans marge termine tout de suite le défi d’un élève', async () => {
    const { db, a, alice, farid } = await setup()
    await recordSave(db, alice.id, a, 'projets/l.sb3')
    expect(await closeOverdue(db, after(0), { only: { studentId: alice.id, activityId: a }, graceMs: 0 })).toBe(1)
    expect(await getProgress(db, farid.id, a)).toBeNull()
  })

  it('un élève dans deux classes du même professeur ne crée qu’une alerte', async () => {
    const { db, prof, a, alice } = await setup()
    const c2 = await createClass(db, prof.id, { name: 'Club', level: '6' })
    await addAssignments(db, c2.id, [a])
    await setAssignmentDue(db, c2.id, a, DUE)
    await addEmailsToClass(db, c2.id, [alice.email])
    await closeOverdue(db, after(GRACE_MS))
    expect((await listUnseenNotices(db, prof.id)).filter((n) => n.studentName === 'Alice Exemple')).toHaveLength(1)
  })

  it('une alerte vue disparaît', async () => {
    const { db, prof } = await setup()
    await closeOverdue(db, after(GRACE_MS))
    const [first] = await listUnseenNotices(db, prof.id)
    expect(await markNoticeSeen(db, prof.id, first.id)).toBe(true)
    expect(await countUnseenNotices(db, prof.id)).toBe(1)
  })
})

describe('coût du passage à chaque page', () => {
  it('une fois les échéances rendues, un nouveau passage fait un nombre constant de requêtes, quel que soit le nombre d’élèves', async () => {
    const { db, c } = await setup()
    const emails = Array.from({ length: 30 }, (_, i) => `eleve.n${i}@malraux-rabat.org`)
    for (const email of emails) await createStudent(db, { email, passwordHash: 'h' })
    await addEmailsToClass(db, c.id, emails)
    expect(await closeOverdue(db, after(GRACE_MS))).toBe(32)
    const client = (db as unknown as { $client: { query: (...a: unknown[]) => unknown } }).$client
    const query = client.query.bind(client)
    let count = 0
    client.query = (...args: unknown[]) => { count++; return query(...args) }
    try {
      expect(await closeOverdue(db, after(GRACE_MS + 60_000))).toBe(0)
    } finally {
      client.query = query
    }
    expect(count).toBeLessThanOrEqual(4)
  })
})
