import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent, listAllStudents } from '@/lib/db/students'
import { addEmailsToClass, createClass, teacherCanSeeStudent } from '@/lib/db/classes'
import { students } from '@/lib/db/schema'

describe('vue globale admin', () => {
  it("l'admin voit tous les élèves, un enseignant seulement ceux de ses classes", async () => {
    const db = await testDb()
    const admin = await createTeacher(db, { email: 'admin.test@malraux-rabat.org', username: 'admin.test', firstName: 'Admin', lastName: 'Test', role: 'admin' })
    const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
    const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    expect(await teacherCanSeeStudent(db, admin.id, alice.id)).toBe(true)
    expect(await teacherCanSeeStudent(db, admin.id, '00000000-0000-4000-8000-000000000000')).toBe(false)
    expect(await teacherCanSeeStudent(db, prof.id, alice.id)).toBe(false)
  })

  it('liste les élèves avec leurs classes et leurs niveaux (déduits des classes), recherche et filtre de niveau', async () => {
    const db = await testDb()
    const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
    await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    await createStudent(db, { email: 'bob.modele@malraux-rabat.org' })
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    const club = await createClass(db, prof.id, { name: 'Club 5e', level: '5' })
    await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org'])
    await addEmailsToClass(db, club.id, ['alice.exemple@malraux-rabat.org'])
    expect(await listAllStudents(db, {})).toEqual([
      expect.objectContaining({ lastName: 'Exemple', classes: ['6e A', 'Club 5e'], levels: ['5', '6'] }),
      expect.objectContaining({ lastName: 'Modele', classes: [], levels: [] }),
    ])
    expect((await listAllStudents(db, { q: 'alice' })).map((s) => s.lastName)).toEqual(['Exemple'])
    expect((await listAllStudents(db, { level: '5' })).map((s) => s.lastName)).toEqual(['Exemple'])
    expect(await listAllStudents(db, { level: '4' })).toEqual([])
  })

  it('la recherche ignore accents et majuscules (« Élise », « elise »)', async () => {
    const db = await testDb()
    await createStudent(db, { email: 'elise.demo@malraux-rabat.org' })
    await db.update(students).set({ firstName: 'Élise' })
    expect((await listAllStudents(db, { q: 'Élise' })).map((s) => s.firstName)).toEqual(['Élise'])
    expect((await listAllStudents(db, { q: 'ELISE' })).map((s) => s.firstName)).toEqual(['Élise'])
  })
})
