'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { createStudent, findStudentByEmail, setStudentPassword, StudentExistsError, touchStudentLogin } from '@/lib/db/students'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { checkPasswordChange, type PasswordChangeError } from '@/lib/auth/password-change'
import { isSchoolEmail, isValidPassword, normalizeEmail } from '@/lib/auth/validation'
import { clearLoginAttempts, isBlocked } from '@/lib/auth/limits'
import { REGISTRATION_CLOSED, studentRegistrationOpen } from '@/lib/auth/registration'
import { requireStudent, setStudentSession } from '@/lib/auth/session'

export type StudentFormState = { error?: string; success?: string } | null

const clientIp = async () => (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
const EMAIL_ERROR = 'Utilise ton adresse du lycée : prenom.nom@malraux-rabat.org'
const PASSWORD_ERRORS: Record<PasswordChangeError, string> = {
  current: 'Ton mot de passe actuel est incorrect.',
  short: 'Ton mot de passe doit contenir au moins 8 caractères.',
  mismatch: 'Les deux mots de passe ne sont pas identiques.',
}

/** `closed` (inscriptions fermées) : même réponse que le compte existe ou non, sans consulter la base ; l'élève passe
 * au mot de passe, et la connexion répond « E-mail ou mot de passe incorrect » dans les deux cas. */
export async function checkStudentEmail(email: string): Promise<{ status: 'invalid' | 'known' | 'new' | 'blocked' | 'closed' }> {
  if (!isSchoolEmail(email)) return { status: 'invalid' }
  if (await isBlocked(getDb(), 'check', { ip: await clientIp() })) return { status: 'blocked' }
  if (!studentRegistrationOpen()) return { status: 'closed' }
  return { status: (await findStudentByEmail(getDb(), email)) ? 'known' : 'new' }
}

export async function studentLogin(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const password = String(formData.get('password') ?? '')
  if (!isSchoolEmail(email)) return { error: EMAIL_ERROR }
  if (await isBlocked(getDb(), 'login', { ip: await clientIp(), account: `eleve:${email}` })) return { error: 'Trop de tentatives. Réessaie dans 15 minutes.' }

  const db = getDb()
  const student = await findStudentByEmail(db, email)
  if (!student || !(await verifyPassword(password, student.passwordHash))) return { error: 'E-mail ou mot de passe incorrect.' }

  await clearLoginAttempts(db, `eleve:${email}`)
  await touchStudentLogin(db, student.id)
  await setStudentSession(student)
  redirect(student.mustChangePassword ? '/nouveau-mot-de-passe' : '/')
}

export async function registerStudent(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  if (!studentRegistrationOpen()) return { error: REGISTRATION_CLOSED }
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const password = formData.get('password')
  if (!isSchoolEmail(email)) return { error: EMAIL_ERROR }
  if (!isValidPassword(password)) return { error: 'Ton mot de passe doit contenir au moins 8 caractères.' }
  if (password !== formData.get('confirm')) return { error: 'Les deux mots de passe ne sont pas identiques.' }
  if (await isBlocked(getDb(), 'register', { ip: await clientIp(), account: email })) return { error: 'Trop de tentatives. Réessaie plus tard.' }

  const db = getDb()
  try {
    const student = await createStudent(db, { email, passwordHash: await hashPassword(password) })
    await touchStudentLogin(db, student.id)
    await setStudentSession(student)
  } catch (e) {
    if (e instanceof StudentExistsError) return { error: 'Un compte existe déjà avec cette adresse. Connecte-toi avec ton mot de passe.' }
    throw e
  }
  redirect('/')
}

export async function forceChangeStudentPassword(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const student = await requireStudent({ allowMustChange: true })
  // Hors mot de passe provisoire, on passe par le profil, qui exige le mot de passe actuel.
  if (!student.mustChangePassword) redirect('/profil')
  const password = String(formData.get('password') ?? '')
  // Le mot de passe provisoire est exigé : une session restée ouverte sur un PC partagé
  // ne doit pas pouvoir choisir le nouveau mot de passe après une réinitialisation.
  const problem = await checkPasswordChange({
    mustChangePassword: false, passwordHash: student.passwordHash,
    current: formData.get('current'), password, confirm: formData.get('confirm'),
  })
  if (problem === 'current') return { error: 'Le mot de passe provisoire est incorrect.' }
  if (problem) return { error: PASSWORD_ERRORS[problem] }
  await setStudentPassword(getDb(), student.id, await hashPassword(password), false)
  await setStudentSession({ ...student, mustChangePassword: false })
  redirect('/')
}

export async function updateStudentPassword(_prev: StudentFormState, formData: FormData): Promise<StudentFormState> {
  const student = await requireStudent()
  const password = String(formData.get('password') ?? '')
  const problem = await checkPasswordChange({
    mustChangePassword: false, passwordHash: student.passwordHash,
    current: formData.get('current'), password, confirm: formData.get('confirm'),
  })
  if (problem) return { error: PASSWORD_ERRORS[problem] }
  await setStudentPassword(getDb(), student.id, await hashPassword(password), false)
  return { success: 'Mot de passe modifié.' }
}
