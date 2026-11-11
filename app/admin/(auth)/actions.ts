'use server'
import { headers } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { createTeacherRequest } from '@/lib/db/teacher-requests'
import { TEACHER_DOMAINS, teacherIdentity } from '@/lib/auth/identity'
import { isSchoolEmail, normalizeEmail } from '@/lib/auth/validation'
import { isBlocked } from '@/lib/auth/limits'
import { sendEmail } from '@/lib/email'

export type FormState = { error?: string; success?: string } | null

const clientIp = async () => (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'

/** Demande de compte enseignant, avec l'adresse prenom.nom de l'un ou l'autre domaine du collège. */
export async function requestTeacherAccess(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!isSchoolEmail(email, TEACHER_DOMAINS))
    return { error: 'Utilisez votre adresse du collège au format prenom.nom@malraux-rabat.org ou prenom.nom@mlfmonde.org.' }
  const db = getDb()
  if (await isBlocked(db, 'request', { ip: await clientIp(), account: teacherIdentity(email) })) return { error: 'Trop de demandes. Réessayez plus tard.' }

  // Doublon (compte ou demande en attente de même identité, l'un ou l'autre domaine) : ni demande ni notification.
  if ((await createTeacherRequest(db, email)) === 'created') {
    await sendEmail({
      to: process.env.ADMIN_NOTIFY_EMAIL ?? 'admin',
      subject: "Demande d'inscription — Parcours Scratch",
      text: `Demande d'inscription de ${email}.\nÀ traiter dans Administration > Demandes.`,
    })
  }
  // Réponse identique dans tous les cas : ne révèle pas l'existence d'un compte.
  return { success: "Demande envoyée. Vous pourrez vous connecter avec Google dès qu'elle aura été validée." }
}
