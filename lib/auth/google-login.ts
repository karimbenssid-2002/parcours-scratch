import { and, eq } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { isEmailInAnyClass } from '@/lib/db/classes'
import { emailIdentity, teacherRequests } from '@/lib/db/schema'
import { createStudent, findStudentByEmail, StudentExistsError, touchStudentLogin, type Student } from '@/lib/db/students'
import { findTeacherByEmail, findTeachersByIdentity, touchTeacherLogin, type Teacher } from '@/lib/db/teachers'
import { TEACHER_DOMAINS, teacherIdentity } from '@/lib/auth/identity'
import { emailDomain, normalizeEmail } from '@/lib/auth/validation'

// Décisions de connexion une fois l'adresse prouvée par Google (et déjà contrôlée par checkGoogleIdentity).
// Élèves et enseignants sont totalement séparés : chaque fonction n'applique que la règle de son rôle.

export type StudentLogin = { ok: true; student: Student } | { ok: false; reason: 'non-inscrit' }
export type TeacherLogin = { ok: true; teacher: Teacher } | { ok: false; reason: 'en-attente' | 'aucun' }

/** Note la connexion (Google ou connexion de développement) avant d'ouvrir la session. */
export async function openStudentAccount(db: DB, s: Student): Promise<Student> {
  await touchStudentLogin(db, s.id)
  return s
}

export async function openTeacherAccount(db: DB, t: Teacher): Promise<Teacher> {
  await touchTeacherLogin(db, t.id)
  return t
}

/**
 * L'élève n'entre que si son adresse figure dans une liste de classe ; son compte est alors créé à la première
 * connexion (noms tirés de l'adresse). Sinon rien n'est créé.
 */
export async function studentGoogleLogin(db: DB, email: string): Promise<StudentLogin> {
  const e = normalizeEmail(email)
  // Même pour un compte existant : un élève retiré de toutes les classes n'entre plus (son compte et ses travaux restent).
  if (!(await isEmailInAnyClass(db, e))) return { ok: false, reason: 'non-inscrit' }
  let student = await findStudentByEmail(db, e)
  if (!student) {
    try {
      student = await createStudent(db, { email: e })
    } catch (err) {
      // Deux onglets en même temps : l'autre a créé le compte.
      if (!(err instanceof StudentExistsError)) throw err
      student = await findStudentByEmail(db, e)
      if (!student) throw err
    }
  }
  return { ok: true, student: await openStudentAccount(db, student) }
}

/**
 * Administrateur : uniquement par son adresse exacte (`teachers.email`). Enseignant : la même adresse, ou la même
 * identité `prenom.nom` (partie avant le @ de `teachers.email`) sur l'autre domaine (teacherIdentity). Compte désactivé → `aucun`. Sans compte : demande
 * d'inscription en attente pour cette identité (l'un ou l'autre domaine) → `en-attente`, sinon `aucun`.
 */
export async function teacherGoogleLogin(db: DB, email: string): Promise<TeacherLogin> {
  const e = normalizeEmail(email)
  const identity = teacherIdentity(e)

  const exact = await findTeacherByEmail(db, e)
  if (exact) return exact.isActive ? { ok: true, teacher: await openTeacherAccount(db, exact) } : { ok: false, reason: 'aucun' }

  // Autre domaine : partie avant le @ de l'adresse ENREGISTRÉE du compte (jamais `username`, qui peut porter un suffixe
  // « prenom.nom2 » sans rapport avec l'adresse). Plusieurs comptes de même identité (doublons anciens) → refus.
  if (!(TEACHER_DOMAINS as readonly string[]).includes(emailDomain(e) ?? '')) return { ok: false, reason: 'aucun' }
  const sameIdentity = await findTeachersByIdentity(db, identity, 2)
  if (sameIdentity.length > 1) return { ok: false, reason: 'aucun' }
  if (sameIdentity.length === 1) {
    const t = sameIdentity[0]
    // Le risque d'homonyme accepté pour mlfmonde.org ne donne jamais les droits d'administrateur.
    if (t.role !== 'prof' || !t.isActive) return { ok: false, reason: 'aucun' }
    return { ok: true, teacher: await openTeacherAccount(db, t) }
  }

  const [pending] = await db.select({ id: teacherRequests.id }).from(teacherRequests).where(and(
    eq(teacherRequests.status, 'pending'),
    eq(emailIdentity(teacherRequests.email), identity),
  )).limit(1)
  return { ok: false, reason: pending ? 'en-attente' : 'aucun' }
}
