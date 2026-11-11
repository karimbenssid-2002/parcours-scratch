import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_COOKIE, STUDENT_COOKIE, signAdmin, signStudent, verifyAdmin, verifyStudent, type AdminClaims, type StudentClaims } from './jwt'
import { getDb } from '@/lib/db/client'
import { findTeacherById, type Teacher } from '@/lib/db/teachers'
import { findStudentById, type Student } from '@/lib/db/students'
import { teacherGate } from './access'

const base = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

export async function getAdminClaims(): Promise<AdminClaims | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  return token ? verifyAdmin(token) : null
}

export async function setAdminSession(t: Teacher): Promise<void> {
  const token = await signAdmin({ teacherId: t.id, username: t.username, role: t.role, mustChangePassword: t.mustChangePassword })
  ;(await cookies()).set(ADMIN_COOKIE, token, { ...base, maxAge: 7 * 24 * 3600 })
}

export async function clearAdminSession(): Promise<void> {
  ;(await cookies()).delete(ADMIN_COOKIE)
}

/** Relit le compte en base à chaque appel : un compte désactivé perd l'accès immédiatement. */
export async function requireTeacher(opts: { role?: 'admin'; allowMustChange?: boolean } = {}): Promise<Teacher> {
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
  const token = await signStudent({ studentId: s.id, mustChangePassword: s.mustChangePassword })
  ;(await cookies()).set(STUDENT_COOKIE, token, { ...base, maxAge: 30 * 24 * 3600 })
}

export async function clearStudentSession(): Promise<void> {
  ;(await cookies()).delete(STUDENT_COOKIE)
}

export async function requireStudent(opts: { allowMustChange?: boolean } = {}): Promise<Student> {
  const claims = await getStudentClaims()
  if (!claims) redirect('/connexion')
  const student = await findStudentById(getDb(), claims.studentId)
  if (!student) redirect('/deconnexion')
  if (student.mustChangePassword && !opts.allowMustChange) redirect('/nouveau-mot-de-passe')
  return student
}

/** Pour les routes API : renvoie null au lieu de rediriger. */
export async function getStudentForApi(): Promise<Student | null> {
  const claims = await getStudentClaims()
  if (!claims) return null
  const student = await findStudentById(getDb(), claims.studentId)
  if (!student || student.mustChangePassword) return null
  return student
}

/** Pour les routes API : renvoie null au lieu de rediriger (compte inactif ou mot de passe provisoire compris). */
export async function getTeacherForApi(): Promise<Teacher | null> {
  const claims = await getAdminClaims()
  if (!claims) return null
  const teacher = await findTeacherById(getDb(), claims.teacherId)
  return teacherGate(teacher) === null ? teacher : null
}
