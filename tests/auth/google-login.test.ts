import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { studentGoogleLogin, teacherGoogleLogin } from '@/lib/auth/google-login'
import { createClass } from '@/lib/db/classes'
import { classStudents, students, teacherRequests, teachers } from '@/lib/db/schema'
import { createTeacher, setTeacherActive } from '@/lib/db/teachers'
import { createTeacherRequest, setRequestStatus } from '@/lib/db/teacher-requests'
import type { DB } from '@/lib/db/client'

async function prof(db: DB, email: string, extra: { role?: 'admin' | 'prof' } = {}) {
  const username = email.split('@')[0]
  return createTeacher(db, {
    email, username, firstName: 'Prénom', lastName: 'Nom', role: extra.role ?? 'prof',
  })
}

/** Ajoute une adresse à une classe telle quelle (sans la passer en minuscules), comme une ligne ancienne. */
async function inClass(db: DB, email: string) {
  const owner = (await db.select().from(teachers).limit(1))[0] ?? await prof(db, 'emma.test@malraux-rabat.org')
  const c = await createClass(db, owner.id, { name: '6e A', level: '6' })
  await db.insert(classStudents).values({ classId: c.id, studentEmail: email })
}

const studentCount = async (db: DB) => (await db.select({ n: count() }).from(students))[0].n

describe('studentGoogleLogin', () => {
  it("crée le compte d'un élève inscrit dans une classe, une seule fois", async () => {
    const db = await testDb()
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    const a = await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(a).toMatchObject({ ok: true, student: { email: 'alice.exemple@malraux-rabat.org', firstName: 'Alice', lastName: 'Exemple' } })
    const b = await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(b.ok && a.ok && b.student.id === a.student.id).toBe(true)
    expect(await studentCount(db)).toBe(1)
    const [row] = await db.select().from(students)
    expect(row.lastLoginAt).not.toBeNull()
  })

  it("refuse un élève absent de toute classe, sans créer de compte", async () => {
    const db = await testDb()
    await inClass(db, 'bob.modele@malraux-rabat.org')
    expect(await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')).toEqual({ ok: false, reason: 'non-inscrit' })
    expect(await studentCount(db)).toBe(0)
  })

  it('reconnaît une adresse en majuscules dans la liste de classe ou chez Google', async () => {
    const db = await testDb()
    await inClass(db, 'Alice.Exemple@Malraux-Rabat.org')
    const r = await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(r).toMatchObject({ ok: true, student: { email: 'alice.exemple@malraux-rabat.org' } })
    const again = await studentGoogleLogin(db, 'ALICE.EXEMPLE@malraux-rabat.org')
    expect(again.ok && r.ok && again.student.id === r.student.id).toBe(true)
    expect(await studentCount(db)).toBe(1)
  })

  it('un compte élève existant inscrit dans une classe entre dans ce compte', async () => {
    const db = await testDb()
    await inClass(db, 'chloe.essai@malraux-rabat.org')
    const [old] = await db.insert(students)
      .values({ email: 'chloe.essai@malraux-rabat.org', firstName: 'Chloe', lastName: 'Essai' })
      .returning()
    const r = await studentGoogleLogin(db, 'chloe.essai@malraux-rabat.org')
    expect(r).toMatchObject({ ok: true, student: { id: old.id } })
    expect((await db.select().from(students).where(eq(students.id, old.id)))[0].lastLoginAt).not.toBeNull()
  })

  it("compte existant retiré de toutes les classes → non-inscrit (compte gardé) ; réinscrit → même compte", async () => {
    const db = await testDb()
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    const first = await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(first.ok).toBe(true)
    await db.delete(classStudents)
    expect(await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')).toEqual({ ok: false, reason: 'non-inscrit' })
    expect(await studentCount(db)).toBe(1)
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    const again = await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(again.ok && first.ok && again.student.id === first.student.id).toBe(true)
  })

  it('deux premières connexions simultanées du même élève → un seul compte', async () => {
    const db = await testDb()
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    const [a, b] = await Promise.all([
      studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org'), studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org'),
    ])
    expect(a.ok && b.ok && a.student.id === b.student.id).toBe(true)
    expect(await studentCount(db)).toBe(1)
  })

  it("un compte créé par Google n'a aucun mot de passe", async () => {
    const db = await testDb()
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    const [row] = await db.select().from(students)
    expect(Object.keys(row).filter((k) => /password/i.test(k))).toEqual([])
  })

  it("même adresse enseignant et dans une classe : l'élève est un compte distinct de l'enseignant", async () => {
    const db = await testDb()
    const t = await prof(db, 'bob.modele@malraux-rabat.org')
    await inClass(db, 'bob.modele@malraux-rabat.org')
    const r = await studentGoogleLogin(db, 'bob.modele@malraux-rabat.org')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.student.id).not.toBe(t.id)
    expect(r.student).not.toHaveProperty('role')
    expect(await studentCount(db)).toBe(1)
  })
})

describe('teacherGoogleLogin', () => {
  it('un enseignant actif entre par ses deux adresses, dans le même compte', async () => {
    const db = await testDb()
    const t = await prof(db, 'bob.modele@malraux-rabat.org')
    const a = await teacherGoogleLogin(db, 'bob.modele@malraux-rabat.org')
    const b = await teacherGoogleLogin(db, 'bob.modele@mlfmonde.org')
    expect(a).toMatchObject({ ok: true, teacher: { id: t.id, role: 'prof' } })
    expect(b).toMatchObject({ ok: true, teacher: { id: t.id, role: 'prof' } })
    expect(await teacherGoogleLogin(db, 'Bob.Modele@MLFmonde.org')).toMatchObject({ ok: true, teacher: { id: t.id } })
  })

  it('un enseignant désactivé → aucun', async () => {
    const db = await testDb()
    const t = await prof(db, 'bob.modele@malraux-rabat.org')
    await setTeacherActive(db, t.id, false)
    expect(await teacherGoogleLogin(db, 'bob.modele@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
    expect(await teacherGoogleLogin(db, 'bob.modele@mlfmonde.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it('demande en attente faite avec @mlfmonde.org, connexion avec @malraux-rabat.org → en-attente', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'chloe.essai@mlfmonde.org')
    expect(await teacherGoogleLogin(db, 'chloe.essai@malraux-rabat.org')).toEqual({ ok: false, reason: 'en-attente' })
    expect(await teacherGoogleLogin(db, 'chloe.essai@mlfmonde.org')).toEqual({ ok: false, reason: 'en-attente' })
  })

  it('aucune demande ou demande refusée → aucun', async () => {
    const db = await testDb()
    expect(await teacherGoogleLogin(db, 'chloe.essai@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
    await createTeacherRequest(db, 'chloe.essai@malraux-rabat.org')
    const [req] = await db.select().from(teacherRequests)
    await setRequestStatus(db, req.id, 'rejected')
    expect(await teacherGoogleLogin(db, 'chloe.essai@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it("une demande d'une autre identité ne compte pas (préfixe commun)", async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'chloe.essai2@malraux-rabat.org')
    expect(await teacherGoogleLogin(db, 'chloe.essai@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it("l'admin entre par son adresse exacte, avec le rôle lu en base", async () => {
    const db = await testDb()
    const admin = await prof(db, 'admin.test@malraux-rabat.org', { role: 'admin' })
    const r = await teacherGoogleLogin(db, 'admin.test@malraux-rabat.org')
    expect(r).toMatchObject({ ok: true, teacher: { id: admin.id, role: 'admin' } })
    expect((await db.select().from(teachers).where(eq(teachers.id, admin.id)))[0].lastLoginAt).not.toBeNull()
  })

  it("l'autre domaine de l'admin (même prenom.nom) n'ouvre PAS le compte admin", async () => {
    const db = await testDb()
    await prof(db, 'admin.test@malraux-rabat.org', { role: 'admin' })
    expect(await teacherGoogleLogin(db, 'admin.test@mlfmonde.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it('admin enregistré en @mlfmonde.org : seule cette adresse entre', async () => {
    const db = await testDb()
    const admin = await prof(db, 'admin.test@mlfmonde.org', { role: 'admin' })
    expect(await teacherGoogleLogin(db, 'admin.test@mlfmonde.org')).toMatchObject({ ok: true, teacher: { id: admin.id, role: 'admin' } })
    expect(await teacherGoogleLogin(db, 'admin.test@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it('un admin désactivé → aucun, même par son adresse exacte', async () => {
    const db = await testDb()
    const admin = await prof(db, 'admin.test@malraux-rabat.org', { role: 'admin' })
    await setTeacherActive(db, admin.id, false)
    expect(await teacherGoogleLogin(db, 'admin.test@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it("enseignant enregistré en @malraux-rabat.org : son adresse @mlfmonde.org entre (règle d'identité)", async () => {
    const db = await testDb()
    const t = await prof(db, 'bob.modele@malraux-rabat.org')
    expect(await teacherGoogleLogin(db, 'bob.modele@mlfmonde.org')).toMatchObject({ ok: true, teacher: { id: t.id } })
  })

  it("l'identité vient de l'adresse enregistrée, jamais de l'identifiant (suffixe « 2 »)", async () => {
    const db = await testDb()
    const t = await createTeacher(db, {
      email: 'bob.modele@mlfmonde.org', username: 'bob.modele2', firstName: 'Bob', lastName: 'Modele', role: 'prof',
    })
    expect(await teacherGoogleLogin(db, 'bob.modele2@mlfmonde.org')).toEqual({ ok: false, reason: 'aucun' })
    expect(await teacherGoogleLogin(db, 'bob.modele2@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
    expect(await teacherGoogleLogin(db, 'bob.modele@malraux-rabat.org')).toMatchObject({ ok: true, teacher: { id: t.id } })
  })

  it("deux comptes dont les adresses ont la même partie avant le @ → aucun (par l'autre domaine)", async () => {
    const db = await testDb()
    await createTeacher(db, { email: 'bob.modele@malraux-rabat.org', username: 'bob.modele', firstName: 'Bob', lastName: 'Modele', role: 'prof' })
    await createTeacher(db, { email: 'bob.modele@autre-domaine.org', username: 'bob.modele3', firstName: 'Bob', lastName: 'Modele', role: 'prof' })
    expect(await teacherGoogleLogin(db, 'bob.modele@mlfmonde.org')).toEqual({ ok: false, reason: 'aucun' })
  })

  it("une adresse hors des domaines enseignants n'entre jamais par l'identité", async () => {
    const db = await testDb()
    await prof(db, 'bob.modele@malraux-rabat.org')
    expect(await teacherGoogleLogin(db, 'bob.modele@gmail.com')).toEqual({ ok: false, reason: 'aucun' })
  })

  it("un élève de même adresse ne donne aucun droit enseignant", async () => {
    const db = await testDb()
    await inClass(db, 'alice.exemple@malraux-rabat.org')
    await studentGoogleLogin(db, 'alice.exemple@malraux-rabat.org')
    expect(await teacherGoogleLogin(db, 'alice.exemple@malraux-rabat.org')).toEqual({ ok: false, reason: 'aucun' })
  })
})
