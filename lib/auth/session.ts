import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_COOKIE, STUDENT_COOKIE, signAdmin, signStudent, verifyAdmin, verifyStudent, type AdminClaims, type StudentClaims } from './jwt'
import { getDb } from '@/lib/db/client'
import { findTeacherById, type Teacher } from '@/lib/db/teachers'
import { findStudentById, type Student } from '@/lib/db/students'
import { isEmailInAnyClass } from '@/lib/db/classes'
import { teacherGate } from './access'

// Lax et non Strict : l'appli installée s'ouvre depuis l'écran d'accueil comme une arrivée extérieure au site ; en
// Strict, le cookie n'y était pas envoyé et l'écran de connexion s'affichait jusqu'au premier rafraîchissement.
const base = () => ({ httpOnly: true as const, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' })

/** Cookie de session prêt à poser, sur `cookies()` ou sur une réponse de route (retour de Google). */
export type SessionCookie = {
  name: string; value: string
  options: { httpOnly: true; sameSite: 'lax'; secure: boolean; path: string; maxAge: number }
}

export async function adminSessionCookie(t: Teacher): Promise<SessionCookie> {
  const value = await signAdmin({ teacherId: t.id, username: t.username, role: t.role })
  return { name: ADMIN_COOKIE, value, options: { ...base(), maxAge: 7 * 24 * 3600 } }
}

export async function studentSessionCookie(s: Student): Promise<SessionCookie> {
  const value = await signStudent({ studentId: s.id })
  return { name: STUDENT_COOKIE, value, options: { ...base(), maxAge: 30 * 24 * 3600 } }
}

export async function getAdminClaims(): Promise<AdminClaims | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  return token ? verifyAdmin(token) : null
}

export async function setAdminSession(t: Teacher): Promise<void> {
  const c = await adminSessionCookie(t)
  ;(await cookies()).set(c.name, c.value, c.options)
}

export async function clearAdminSession(): Promise<void> {
  ;(await cookies()).delete(ADMIN_COOKIE)
}

/** Relit le compte en base à chaque appel : un compte désactivé perd l'accès immédiatement. */
export async function requireTeacher(opts: { role?: 'admin' } = {}): Promise<Teacher> {
  const claims = await getAdminClaims()
  if (!claims) redirect('/admin/login')
  const teacher = await findTeacherById(getDb(), claims.teacherId)
  const blocked = teacherGate(teacher, opts)
  if (blocked || !teacher) redirect(blocked ?? '/admin/deconnexion')
  return teacher
}

export async function getStudentClaims(): Promise<StudentClaims | null> {
  const token = (await cookies()).get(STUDENT_COOKIE)?.value
  return token ? verifyStudent(token) : null
}

export async function setStudentSession(s: Student): Promise<void> {
  const c = await studentSessionCookie(s)
  ;(await cookies()).set(c.name, c.value, c.options)
}

export async function clearStudentSession(): Promise<void> {
  ;(await cookies()).delete(STUDENT_COOKIE)
}

/**
 * Relit le compte et les listes de classe à chaque appel : un élève retiré de toutes les classes perd l'accès
 * immédiatement (session effacée par /deconnexion, puis message « non inscrit »), comme à la connexion.
 */
export async function requireStudent(): Promise<Student> {
  const claims = await getStudentClaims()
  if (!claims) redirect('/connexion')
  const db = getDb()
  const student = await findStudentById(db, claims.studentId)
  if (!student) redirect('/deconnexion')
  if (!(await isEmailInAnyClass(db, student.email))) redirect('/deconnexion?erreur=non-inscrit')
  return student
}

/** Pour les routes API : renvoie null au lieu de rediriger (élève retiré de toutes les classes compris). */
export async function getStudentForApi(): Promise<Student | null> {
  const claims = await getStudentClaims()
  if (!claims) return null
  const db = getDb()
  const student = await findStudentById(db, claims.studentId)
  return student && (await isEmailInAnyClass(db, student.email)) ? student : null
}

/** Pour les routes API : renvoie null au lieu de rediriger (compte inactif compris). */
export async function getTeacherForApi(): Promise<Teacher | null> {
  const claims = await getAdminClaims()
  if (!claims) return null
  const teacher = await findTeacherById(getDb(), claims.teacherId)
  return teacherGate(teacher) === null ? teacher : null
}
