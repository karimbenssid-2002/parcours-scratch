import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, listClassAssignments, listStudentDefis } from '@/lib/db/assignments'
import { setSolution } from '@/lib/db/autograde'
import { canSeeSolution, setSolutionShared } from '@/lib/autograde/corrige'

async function setup(withSolution = true) {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  if (withSolution) await setSolution(db, a, `solutions/${a}.sb3`, 'sb3')
  const c1 = await createClass(db, prof.id, { name: '6e A', level: '6' })
  const c2 = await createClass(db, prof.id, { name: '6e B', level: '6' })
  await addAssignments(db, c1.id, [a])
  await addAssignments(db, c2.id, [a])
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
  await addEmailsToClass(db, c1.id, [alice.email])
  return { db, prof, a, c1, c2, alice }
}

describe('corrigé partagé', () => {
  it('un élève le voit seulement si une de ses classes l’a partagé', async () => {
    const { db, a, c1, c2, alice } = await setup()
    expect(await canSeeSolution(db, { studentId: alice.id }, a)).toBe(false)
    expect(await setSolutionShared(db, c2.id, a, true)).toBe(true) // classe où l'élève n'est pas
    expect(await canSeeSolution(db, { studentId: alice.id }, a)).toBe(false)
    await setSolutionShared(db, c1.id, a, true)
    expect(await canSeeSolution(db, { studentId: alice.id }, a)).toBe(true)
    expect((await listStudentDefis(db, alice.id))[0].solutionShared).toBe(true)
    expect((await listClassAssignments(db, c1.id))[0]).toMatchObject({ solutionShared: true, hasSolution: true })
    await setSolutionShared(db, c1.id, a, false)
    expect(await canSeeSolution(db, { studentId: alice.id }, a)).toBe(false)
    expect((await listStudentDefis(db, alice.id))[0].solutionShared).toBe(false)
  })

  it('un enseignant le voit toujours ; sans solution, personne', async () => {
    const withSol = await setup()
    expect(await canSeeSolution(withSol.db, { teacherId: withSol.prof.id }, withSol.a)).toBe(true)
    const none = await setup(false)
    await setSolutionShared(none.db, none.c1.id, none.a, true)
    expect(await canSeeSolution(none.db, { teacherId: none.prof.id }, none.a)).toBe(false)
    expect(await canSeeSolution(none.db, { studentId: none.alice.id }, none.a)).toBe(false)
    expect((await listClassAssignments(none.db, none.c1.id))[0].hasSolution).toBe(false)
  })
})
