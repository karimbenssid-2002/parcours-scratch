'use server'
import { headers } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { createTeacherRequestId } from '@/lib/db/teacher-requests'
import { TEACHER_DOMAINS, teacherIdentity } from '@/lib/auth/identity'
import { isSchoolEmail, normalizeEmail } from '@/lib/auth/validation'
import { isBlocked } from '@/lib/auth/limits'
import { sendEmail } from '@/lib/email'
import { schedule } from '@/lib/push/schedule'
import { notifyTeacherRequest } from '@/lib/push/events'
import { safeAction } from '@/lib/http/safe-action'

export type FormState = { error?: string; success?: string } | null

const REQUEST_SENT = "Demande envoyée. Si elle est validée, vous vous connecterez avec Google avec cette adresse. "
  + "Si vous avez déjà un compte, connectez-vous avec l'adresse de ce compte."

const clientIp = async () => (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'

/**
 * Demande de compte enseignant, avec l'adresse prenom.nom de l'un ou l'autre domaine du collège. Le compte validé ne
 * s'ouvrira qu'avec cette adresse exacte (teacherGoogleLogin).
 */
export async function requestTeacherAccess(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!isSchoolEmail(email, TEACHER_DOMAINS))
    return { error: 'Utilisez votre adresse du collège au format prenom.nom@malraux-rabat.org ou prenom.nom@mlfmonde.org.' }
  // Erreur imprévue (base…) : journalisée sans l'adresse, réponse générique.
  return safeAction('demande de compte', async () => {
    const db = getDb()
    if (await isBlocked(db, 'request', { ip: await clientIp(), account: teacherIdentity(email) })) return { error: 'Trop de demandes. Réessayez plus tard.' }

    // Doublon (compte ou demande en attente de même identité, l'un ou l'autre domaine) : ni demande ni notification.
    // Un seul compte par personne ; la connexion, elle, n'accepte que l'adresse exacte du compte.
    const request = await createTeacherRequestId(db, email)
    if (request.status === 'created') {
      await sendEmail({
        to: process.env.ADMIN_NOTIFY_EMAIL ?? 'admin',
        subject: "Demande d'inscription — Parcours Scratch",
        text: `Demande d'inscription de ${email}.\nÀ traiter dans Administration > Demandes.`,
      })
      schedule(() => notifyTeacherRequest(db, request.id))
    }
    // Réponse identique dans tous les cas (demande créée ou doublon silencieux) : ne révèle pas l'existence d'un compte,
    // et ne promet rien qu'un doublon démentirait.
    return { success: REQUEST_SENT }
  }, () => ({ error: "La demande n'a pas pu être envoyée. Réessayez plus tard." }))
}
