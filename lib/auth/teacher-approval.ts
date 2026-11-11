import type { DB } from '@/lib/db/client'
import { claimPendingRequest, findRequestById, setRequestStatus } from '@/lib/db/teacher-requests'
import { createTeacher, findTeacherByUsername, findTeachersByIdentity } from '@/lib/db/teachers'
import { teacherIdentity } from './identity'
import { namesFromEmail } from './validation'
import { sendEmail } from '@/lib/email'

export type ApproveResult = { ok: true; username: string } | { ok: false; error: string }

const ALREADY_DONE: ApproveResult = { ok: false, error: 'Demande introuvable ou déjà traitée.' }
const DUPLICATE: ApproveResult = { ok: false, error: 'Un compte existe déjà pour cet enseignant.' }

/** Crée le compte enseignant (sans mot de passe : connexion avec Google), identifiant = prenom.nom de l'adresse. */
export async function approveTeacherRequest(db: DB, requestId: string): Promise<ApproveResult> {
  const req = await findRequestById(db, requestId)
  if (!req || req.status !== 'pending') return ALREADY_DONE
  // Réservation atomique (UPDATE … WHERE status = 'pending') : deux validations simultanées ne peuvent pas passer toutes les deux.
  if (!(await claimPendingRequest(db, req.id))) return ALREADY_DONE

  try {
    const username = teacherIdentity(req.email)
    // Même identité sur l'un ou l'autre domaine (adresse enregistrée), ou identifiant déjà pris : un seul compte par personne.
    if ((await findTeachersByIdentity(db, username, 1)).length || (await findTeacherByUsername(db, username))) {
      await setRequestStatus(db, req.id, 'rejected')
      return DUPLICATE
    }
    await createTeacher(db, { email: req.email, ...namesFromEmail(req.email), username, role: 'prof' })
    await sendEmail({
      to: req.email,
      subject: 'Votre compte est validé — Parcours Scratch',
      text: 'Votre compte enseignant est validé. Connectez-vous avec « Se connecter avec Google », '
        + 'avec votre adresse @malraux-rabat.org ou @mlfmonde.org.',
    })
    return { ok: true, username }
  } catch (e) {
    await setRequestStatus(db, req.id, 'pending') // la demande reste à traiter
    throw e
  }
}
