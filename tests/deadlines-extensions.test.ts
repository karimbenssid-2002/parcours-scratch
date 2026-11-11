import { describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, setAssignmentDue, studentDeadline } from '@/lib/db/assignments'
import { getProgress } from '@/lib/db/progress'
import { closeOverdue, GRACE_MS } from '@/lib/deadlines/close'
import { grantExtension } from '@/lib/deadlines/extensions'

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const other = await createTeacher(db, { email: 'david.essai@malraux-rabat.org', username: 'david.essai', firstName: 'David', lastName: 'Essai', role: 'prof' })
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, c.id, [a])
  await setAssignmentDue(db, c.id, a, new Date(Date.now() - GRACE_MS - 1000).toISOString())
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  await addEmailsToClass(db, c.id, [alice.email])
  await closeOverdue(db)
  return { db, prof, other, a, alice }
}

describe('délai accordé', () => {
  const future = () => new Date(Date.now() + 86_400_000).toISOString()

  it('rouvre un défi « Non rendu » et remplace l’échéance', async () => {
    const { db, prof, a, alice } = await setup()
    expect((await getProgress(db, alice.id, a))!.status).toBe('not_submitted')
    const due = future()
    expect(await grantExtension(db, prof.id, alice.id, a, due)).toEqual({ ok: true })
    expect((await getProgress(db, alice.id, a))!).toMatchObject({ status: 'not_started', closedDueAt: null })
    expect((await studentDeadline(db, alice.id, a)).dueAt).toBe(due)
  })

  it('refuse une date passée et un professeur qui n’a pas l’élève', async () => {
    const { db, prof, other, a, alice } = await setup()
    expect(await grantExtension(db, prof.id, alice.id, a, new Date(Date.now() - 1000).toISOString())).toMatchObject({ ok: false })
    expect(await grantExtension(db, other.id, alice.id, a, future())).toMatchObject({ ok: false })
  })

  it('refuse un délai sur un défi qu’aucune de ses classes ne donne (classe d’un autre enseignant)', async () => {
    const { db, other, a, alice } = await setup()
    const club = await createClass(db, other.id, { name: 'Club', level: '6' })
    await addEmailsToClass(db, club.id, [alice.email]) // l'autre enseignant voit l'élève, mais ne donne pas ce défi
    expect(await grantExtension(db, other.id, alice.id, a, future())).toMatchObject({ ok: false })
    expect((await getProgress(db, alice.id, a))!.status).toBe('not_submitted')
  })
})

