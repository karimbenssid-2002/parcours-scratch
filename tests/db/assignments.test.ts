import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { addToLevel, createActivity, setActivityStatus } from '@/lib/db/activities'
import { deadlineExtensions } from '@/lib/db/schema'
import {
  addAssignments, addLevelParcours, effectiveDueAt, listClassAssignments, listPublishedStock, listStudentDefis,
  removeAssignment, setAssignmentDue, setAssignmentOrder, studentDeadline,
} from '@/lib/db/assignments'

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
  const make = async (title: string, status: 'draft' | 'published' = 'published') => {
    const { id } = await createActivity(db, { title })
    await setActivityStatus(db, id, status)
    return id
  }
  const a = await make('Le serpent')
  const b = await make('Le carré')
  const draft = await make('Brouillon', 'draft')
  const c1 = await createClass(db, prof.id, { name: '6e A', level: '6' })
  const c2 = await createClass(db, prof.id, { name: 'Club', level: '6' })
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
  await addEmailsToClass(db, c1.id, [alice.email])
  return { db, prof, a, b, draft, c1, c2, alice }
}

describe('échéance effective', () => {
  it('prend la plus tardive, aucune si une classe n’en a pas ; un délai ne raccourcit jamais l’échéance', () => {
    expect(effectiveDueAt([], null)).toBeNull()
    expect(effectiveDueAt(['2026-10-10T10:00:00.000Z', '2026-10-12T10:00:00.000Z'], null)).toBe('2026-10-12T10:00:00.000Z')
    expect(effectiveDueAt(['2026-10-10T10:00:00.000Z', null], null)).toBeNull()
    expect(effectiveDueAt(['2026-10-10T10:00:00.000Z'], '2026-10-20T10:00:00.000Z')).toBe('2026-10-20T10:00:00.000Z')
    // date de classe repoussée après le délai accordé : l'élève garde la date la plus tardive
    expect(effectiveDueAt(['2026-10-25T10:00:00.000Z'], '2026-10-20T10:00:00.000Z')).toBe('2026-10-25T10:00:00.000Z')
    expect(effectiveDueAt([null], '2026-10-20T10:00:00.000Z')).toBeNull()
  })
})

describe('défis donnés à une classe', () => {
  it('ajoute des activités publiées à la suite, sans doublon ni brouillon', async () => {
    const { db, a, b, draft, c1 } = await setup()
    expect(await addAssignments(db, c1.id, [b, a, draft, b])).toBe(2)
    expect(await addAssignments(db, c1.id, [a])).toBe(0)
    expect((await listClassAssignments(db, c1.id)).map((x) => [x.activityId, x.position])).toEqual([[b, 1], [a, 2]])
  })

  it('ajoute tout le parcours publié d’un niveau', async () => {
    const { db, a, b, draft, c1 } = await setup()
    await addToLevel(db, { level: '6', activityId: draft, position: 1, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: b, position: 2, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: a, position: 3, section: 'defis' })
    expect(await addLevelParcours(db, c1.id, '6')).toBe(2)
    expect((await listClassAssignments(db, c1.id)).map((x) => x.activityId)).toEqual([b, a])
  })

  it('réordonne (refuse une liste incomplète), retire et compacte, fixe une échéance', async () => {
    const { db, a, b, c1 } = await setup()
    await addAssignments(db, c1.id, [a, b])
    expect(await setAssignmentOrder(db, c1.id, [b])).toBe(false)
    expect(await setAssignmentOrder(db, c1.id, [b, a])).toBe(true)
    expect(await setAssignmentDue(db, c1.id, a, '2026-10-14T17:00:00.000Z')).toBe(true)
    expect((await listClassAssignments(db, c1.id)).map((x) => [x.activityId, x.position, x.dueAt]))
      .toEqual([[b, 1, null], [a, 2, '2026-10-14T17:00:00.000Z']])
    await removeAssignment(db, c1.id, b)
    expect((await listClassAssignments(db, c1.id)).map((x) => [x.activityId, x.position])).toEqual([[a, 1]])
  })
})

describe('défis visibles par un élève', () => {
  it('seulement ceux de ses classes, publiés, dédoublonnés, numérotés', async () => {
    const { db, a, b, draft, c1, c2, alice } = await setup()
    await addAssignments(db, c1.id, [a])
    await addAssignments(db, c2.id, [a, b]) // « Le serpent » donné par les deux classes : affiché une fois
    await addEmailsToClass(db, c2.id, [alice.email])
    await addAssignments(db, c1.id, [draft]) // brouillon : ignoré
    const defis = await listStudentDefis(db, alice.id)
    expect(defis.map((d) => [d.title, d.number])).toEqual([['Le serpent', 1], ['Le carré', 2]])
  })

  it('applique l’échéance la plus tardive de ses classes, ou sa prolongation', async () => {
    const { db, a, c1, c2, alice } = await setup()
    await addAssignments(db, c1.id, [a])
    await addAssignments(db, c2.id, [a])
    await addEmailsToClass(db, c2.id, [alice.email])
    await setAssignmentDue(db, c1.id, a, '2026-10-10T10:00:00.000Z')
    await setAssignmentDue(db, c2.id, a, '2026-10-12T10:00:00.000Z')
    expect(await studentDeadline(db, alice.id, a)).toEqual({ visible: true, dueAt: '2026-10-12T10:00:00.000Z', number: 1 })
    await db.insert(deadlineExtensions).values({ studentId: alice.id, activityId: a, dueAt: '2026-10-20T10:00:00.000Z' })
    expect((await studentDeadline(db, alice.id, a)).dueAt).toBe('2026-10-20T10:00:00.000Z')
  })

  it('un défi non donné n’est pas visible', async () => {
    const { db, b, alice } = await setup()
    expect(await studentDeadline(db, alice.id, b)).toEqual({ visible: false, dueAt: null, number: null })
  })
})

describe('stock', () => {
  it('liste les activités publiées avec leurs niveaux', async () => {
    const { db, a, b } = await setup()
    await addToLevel(db, { level: '5', activityId: a, position: 1, section: 'defis' })
    expect(await listPublishedStock(db)).toEqual([
      { id: b, title: 'Le carré', levels: [] },
      { id: a, title: 'Le serpent', levels: ['5'] },
    ])
  })
})
