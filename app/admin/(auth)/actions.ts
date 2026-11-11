'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { findTeacherByUsername, setTeacherPassword, touchTeacherLogin } from '@/lib/db/teachers'
import { createTeacherRequest, type RequestType } from '@/lib/db/teacher-requests'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { checkPasswordChange } from '@/lib/auth/password-change'
import { isSchoolEmail, normalizeEmail, SCHOOL_DOMAIN } from '@/lib/auth/validation'
import { clearLoginAttempts, isBlocked } from '@/lib/auth/limits'
import { requireTeacher, setAdminSession } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email'

export type FormState = { error?: string; success?: string } | null

const clientIp = async () => (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'

export async function adminLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const db = getDb()
  if (await isBlocked(db, 'login', { ip: await clientIp(), account: `prof:${username}` }))
    return { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }

  const teacher = await findTeacherByUsername(db, username)
  if (!teacher || !teacher.isActive || !(await verifyPassword(password, teacher.passwordHash)))
    return { error: 'Identifiant ou mot de passe incorrect.' }

  await clearLoginAttempts(db, `prof:${username}`)
  await touchTeacherLogin(db, teacher.id)
  await setAdminSession(teacher)
  redirect(teacher.mustChangePassword ? '/admin/changer-mot-de-passe' : '/admin')
}

export async function requestTeacherAccess(type: RequestType, _prev: FormState, formData: FormData): Promise<FormState> {
  if (type !== 'registration' && type !== 'reset') return { error: 'Demande invalide.' }
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!isSchoolEmail(email))
    return { error: `Utilisez votre adresse de l'établissement au format prenom.nom@${SCHOOL_DOMAIN}.` }
  if (await isBlocked(getDb(), 'request', { ip: await clientIp(), account: email })) return { error: 'Trop de demandes. Réessayez plus tard.' }

  await createTeacherRequest(getDb(), type, email)
  const label = type === 'registration' ? "Demande d'inscription" : 'Demande de réinitialisation'
  await sendEmail({
    to: process.env.ADMIN_NOTIFY_EMAIL ?? 'admin',
    subject: `${label} — Parcours Scratch`,
    text: `${label} de ${email}.\nÀ traiter dans Administration > Demandes.`,
  })
  // Réponse identique dans tous les cas : ne révèle pas l'existence d'un compte.
  return { success: "Demande envoyée. Vous recevrez vos identifiants par e-mail dès qu'elle aura été validée." }
}

export async function changeAdminPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher({ allowMustChange: true })
  const password = String(formData.get('password') ?? '')
  const problem = await checkPasswordChange({
    mustChangePassword: teacher.mustChangePassword, passwordHash: teacher.passwordHash,
    current: formData.get('current'), password, confirm: formData.get('confirm'),
  })
  if (problem === 'current') return { error: 'Votre mot de passe actuel est incorrect.' }
  if (problem === 'short') return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  if (problem === 'mismatch') return { error: 'Les deux mots de passe ne correspondent pas.' }

  await setTeacherPassword(getDb(), teacher.id, await hashPassword(password), false)
  await setAdminSession({ ...teacher, mustChangePassword: false })
  redirect('/admin')
}
