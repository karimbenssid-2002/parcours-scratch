import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { classStudents, deadlineExtensions, progress, pushSubscriptions, reviews, students } from '@/lib/db/schema'
import { studentGoogleLogin } from '@/lib/auth/google-login'
import { writeStored } from '@/lib/storage/files'
import { setBucketForTests } from '@/lib/storage/supabase'
import { deleteOrphanFolders, eraseStudent } from '@/lib/retention/erase'
import { bucketAvecEtat } from '../helpers/fake-bucket'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erase-'))
  process.env.STORAGE_DIR = dir
})
afterEach(() => {
  delete process.env.STORAGE_DIR
  delete process.env.STORAGE_BACKEND
  setBucketForTests(null)
  fs.rmSync(dir, { recursive: true, force: true })
})

const bytes = new Uint8Array([1, 2, 3])

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, c.id, [a])
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  const bob = await createStudent(db, { email: 'bob.exemple@malraux-rabat.org' })
  await addEmailsToClass(db, c.id, [alice.email, bob.email])
  return { db, prof, a, c, alice, bob }
}

async function giveWork(db: Awaited<ReturnType<typeof testDb>>, profId: string, studentId: string, activityId: string) {
  const [p] = await db.insert(progress).values({ studentId, activityId, status: 'submitted', projectPath: `projets/${studentId}/a.sb3` }).returning()
  await db.insert(reviews).values({ progressId: p.id, teacherId: profId, decision: 'validated' })
  await db.insert(deadlineExtensions).values({ studentId, activityId, dueAt: new Date().toISOString() })
  await db.insert(pushSubscriptions).values({ ownerKind: 'student', ownerId: studentId, endpoint: 'https://push.test/s', p256dh: 'k', auth: 'a' })
}

describe('eraseStudent', () => {
  it('efface le compte, ses défis, retours, délais, abonnements et fichiers', async () => {
    const { db, prof, a, alice } = await setup()
    await giveWork(db, prof.id, alice.id, a)
    await writeStored(`projets/${alice.id}/a.sb3`, bytes)

    expect(await eraseStudent(db, alice.id)).toEqual({ found: true, files: 1, filesPending: false })

    expect(await db.select().from(students).where(eq(students.id, alice.id))).toHaveLength(0)
    expect(await db.select().from(progress).where(eq(progress.studentId, alice.id))).toHaveLength(0)
    expect(await db.select().from(reviews)).toHaveLength(0)
    expect(await db.select().from(deadlineExtensions).where(eq(deadlineExtensions.studentId, alice.id))).toHaveLength(0)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerId, alice.id))).toHaveLength(0)
    expect(await db.select().from(classStudents).where(eq(classStudents.studentEmail, alice.email))).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, 'projets', alice.id, 'a.sb3'))).toBe(false)
  })

  it('efface aussi les fichiers orphelins du dossier de l’élève', async () => {
    const { db, alice } = await setup()
    await writeStored(`projets/${alice.id}/abandon.sb3`, bytes)
    expect(await eraseStudent(db, alice.id)).toEqual({ found: true, files: 1, filesPending: false })
    expect(fs.existsSync(path.join(dir, 'projets', alice.id))).toBe(false)
  })

  it('ne touche pas aux autres élèves ni à l’abonnement d’un enseignant de même identifiant', async () => {
    const { db, prof, a, alice, bob } = await setup()
    await giveWork(db, prof.id, alice.id, a)
    await giveWork(db, prof.id, bob.id, a)
    await db.insert(pushSubscriptions).values({ ownerKind: 'teacher', ownerId: alice.id, endpoint: 'https://push.test/t', p256dh: 'k', auth: 'a' })
    await writeStored(`projets/${bob.id}/a.sb3`, bytes)

    await eraseStudent(db, alice.id)

    expect(await db.select().from(students).where(eq(students.id, bob.id))).toHaveLength(1)
    expect(await db.select().from(progress).where(eq(progress.studentId, bob.id))).toHaveLength(1)
    expect(await db.select().from(reviews)).toHaveLength(1)
    expect(await db.select().from(deadlineExtensions).where(eq(deadlineExtensions.studentId, bob.id))).toHaveLength(1)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerId, bob.id))).toHaveLength(1)
    expect(await db.select().from(classStudents).where(eq(classStudents.studentEmail, bob.email))).toHaveLength(1)
    const teacherSubs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerKind, 'teacher'))
    expect(teacherSubs).toHaveLength(1)
    expect(fs.existsSync(path.join(dir, 'projets', bob.id, 'a.sb3'))).toBe(true)
  })

  it('après suppression, la connexion Google est refusée', async () => {
    const { db, alice } = await setup()
    await eraseStudent(db, alice.id)
    expect(await studentGoogleLogin(db, alice.email)).toEqual({ ok: false, reason: 'non-inscrit' })
    expect(await db.select().from(students).where(eq(students.email, alice.email))).toHaveLength(0)
  })

  it('élève inconnu : { found: false, files: 0, filesPending: false }', async () => {
    const { db } = await setup()
    expect(await eraseStudent(db, 'inconnu')).toEqual({ found: false, files: 0, filesPending: false })
  })

  it('retire l’adresse des listes de classe quelle que soit la casse', async () => {
    const { db, prof, c, alice, bob } = await setup()
    const c2 = await createClass(db, prof.id, { name: '5e B', level: '5' })
    // Ligne saisie avant la normalisation des adresses : isEmailInAnyClass la reconnaît (lower), l'effacement aussi.
    await db.insert(classStudents).values({ classId: c2.id, studentEmail: 'Alice.Exemple@Malraux-Rabat.org' })

    await eraseStudent(db, alice.id)

    const restes = await db.select().from(classStudents)
    expect(restes).toEqual([{ classId: c.id, studentEmail: bob.email }])
  })

  it('stockage en panne : compte et données effacés, fichiers signalés « à effacer », repris par le passage quotidien', async () => {
    const { db, prof, a, alice, bob } = await setup()
    await giveWork(db, prof.id, alice.id, a)
    process.env.STORAGE_BACKEND = 'supabase'
    const f = bucketAvecEtat([`projets/${alice.id}/a.sb3`, `projets/${bob.id}/a.sb3`])
    setBucketForTests(f.bucket)
    f.panne.on = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await eraseStudent(db, alice.id)).toEqual({ found: true, files: 0, filesPending: true })
      expect(error).toHaveBeenCalledTimes(1)
      const ligne = String(error.mock.calls[0][0])
      expect(ligne).toBe('[suppression d’un élève] fichiers non effacés, repris par la tâche quotidienne : stockage indisponible')
      expect(ligne).not.toContain('@')
      expect(ligne).not.toContain(alice.id)
    } finally {
      error.mockRestore()
    }
    // La base est à jour : l'élève n'existe plus.
    expect(await db.select().from(students).where(eq(students.id, alice.id))).toHaveLength(0)
    expect(await db.select().from(progress).where(eq(progress.studentId, alice.id))).toHaveLength(0)
    expect(f.etat.has(`projets/${alice.id}/a.sb3`)).toBe(true)

    // Le passage quotidien efface le dossier orphelin, et lui seul.
    f.panne.on = false
    expect(await deleteOrphanFolders(db)).toEqual({ deleted: 1, complete: true })
    expect([...f.etat]).toEqual([`projets/${bob.id}/a.sb3`])
  })

  it('erreur de la base : elle remonte, rien n’est effacé', async () => {
    const { db, alice } = await setup()
    await writeStored(`projets/${alice.id}/a.sb3`, bytes)
    const tx = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('base indisponible'))
    await expect(eraseStudent(db, alice.id)).rejects.toThrow('base indisponible')
    tx.mockRestore()
    expect(await db.select().from(students).where(eq(students.id, alice.id))).toHaveLength(1)
    expect(fs.existsSync(path.join(dir, 'projets', alice.id, 'a.sb3'))).toBe(true)
  })
})
