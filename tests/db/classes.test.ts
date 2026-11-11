import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import {
  addEmailsToClass, classGrid, studentClasses, createClass, deleteClass, getClassForTeacher, listClassesForTeacher, listClassMembers,
  removeEmailFromClass, teacherCanSeeStudent, updateClass,
} from '@/lib/db/classes'
import { addAssignments } from '@/lib/db/assignments'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addToLevel, setActivityStatus, upsertBreizhActivity } from '@/lib/db/activities'
import { recordSave } from '@/lib/db/progress'

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const other = await createTeacher(db, { email: 'david.essai@malraux-rabat.org', username: 'david.essai', firstName: 'David', lastName: 'Essai', role: 'prof' })
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  return { db, prof, other, alice }
}

describe('classes', () => {
  it('crée, liste avec effectif, renomme et supprime ses propres classes', async () => {
    const { db, prof } = await setup()
    const c = await createClass(db, prof.id, { name: '  6e A ', level: '6' })
    expect(c.name).toBe('6e A')
    await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org'])
    expect(await listClassesForTeacher(db, prof.id)).toMatchObject([{ name: '6e A', studentCount: 2 }])
    expect(await updateClass(db, prof.id, c.id, { name: '6e B', level: '6' })).toBe(true)
    expect(await deleteClass(db, prof.id, c.id)).toBe(true)
    expect(await listClassesForTeacher(db, prof.id)).toEqual([])
  })

  it("refuse de modifier ou supprimer la classe d'un autre enseignant", async () => {
    const { db, prof, other } = await setup()
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    expect(await getClassForTeacher(db, other.id, c.id)).toBeNull()
    expect(await updateClass(db, other.id, c.id, { name: 'Piraté', level: '3' })).toBe(false)
    expect(await deleteClass(db, other.id, c.id)).toBe(false)
    expect((await getClassForTeacher(db, prof.id, c.id))?.name).toBe('6e A')
  })

  it('ajoute des e-mails sans doublon, liste les membres inscrits ou non, et retire un membre', async () => {
    const { db, prof, alice } = await setup()
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    expect(await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org']))
      .toEqual({ added: ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org'], already: [] })
    expect(await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org']))
      .toEqual({ added: [], already: ['alice.exemple@malraux-rabat.org'] })
    expect(await listClassMembers(db, c.id)).toEqual([
      { email: 'alice.exemple@malraux-rabat.org', student: { id: alice.id, firstName: 'Alice', lastName: 'Exemple' } },
      { email: 'bob.modele@malraux-rabat.org', student: null },
    ])
    await removeEmailFromClass(db, c.id, 'bob.modele@malraux-rabat.org')
    expect((await listClassMembers(db, c.id)).map((m) => m.email)).toEqual(['alice.exemple@malraux-rabat.org'])
  })

  it('un enseignant ne voit que les élèves de ses classes', async () => {
    const { db, prof, other, alice } = await setup()
    expect(await teacherCanSeeStudent(db, prof.id, alice.id)).toBe(false)
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org'])
    expect(await teacherCanSeeStudent(db, prof.id, alice.id)).toBe(true)
    expect(await teacherCanSeeStudent(db, other.id, alice.id)).toBe(false)
  })

  it('construit la grille élèves × défis publiés donnés à la classe', async () => {
    const { db, prof, alice } = await setup()
    const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'A', slug: 'a', statementYoutubeId: null, thumbnail: null })
    const b = await upsertBreizhActivity(db, { sourceRef: 2, title: 'B', slug: 'b', statementYoutubeId: null, thumbnail: null })
    await addToLevel(db, { level: '6', activityId: a.id, position: 1, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: b.id, position: 2, section: 'defis' })
    await setActivityStatus(db, a.id, 'published')
    await setActivityStatus(db, b.id, 'published')
    await recordSave(db, alice.id, a.id, 'projets/x.sb3')
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org'])
    await addAssignments(db, c.id, [b.id, a.id])

    const grid = await classGrid(db, c)
    expect(grid.activities.map((x) => x.title)).toEqual(['B', 'A'])
    expect(grid.rows).toHaveLength(2)
    expect(grid.rows[0].statuses[a.id]).toMatchObject({ status: 'in_progress' })
    expect(grid.rows[0].statuses[b.id]).toBeUndefined()
    expect(grid.rows[1]).toMatchObject({ member: { student: null }, statuses: {} })
  })

  it('liste les classes d’un élève par e-mail', async () => {
    const { db, prof } = await setup()
    const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
    await addEmailsToClass(db, c.id, ['alice.exemple@malraux-rabat.org'])
    expect(await studentClasses(db, 'Alice.Exemple@malraux-rabat.org')).toEqual([{ id: c.id, name: '6e A', level: '6' }])
    expect(await studentClasses(db, 'personne@malraux-rabat.org')).toEqual([])
  })
})
