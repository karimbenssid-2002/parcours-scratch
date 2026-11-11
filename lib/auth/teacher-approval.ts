import type { DB } from '@/lib/db/client'
import { claimPendingRequest, findRequestById, setRequestStatus } from '@/lib/db/teacher-requests'
import { buildUniqueUsername, createTeacher, findTeacherByEmail, setTeacherPassword } from '@/lib/db/teachers'
import { namesFromEmail } from './validation'
import { generateProvisionalPassword, hashPassword } from './password'
import { sendEmail } from '@/lib/email'

export type ApproveResult = { ok: true; username: string; password: string } | { ok: false; error: string }

const ALREADY_DONE: ApproveResult = { ok: false, error: 'Demande introuvable ou déjà traitée.' }

export async function approveTeacherRequest(db: DB, requestId: string): Promise<ApproveResult> {
  const req = await findRequestById(db, requestId)
  if (!req || req.status !== 'pending') return ALREADY_DONE
  // Réservation atomique (UPDATE … WHERE status = 'pending') : deux validations simultanées ne peuvent pas passer toutes les deux.
  if (!(await claimPendingRequest(db, req.id))) return ALREADY_DONE

  try {
    const password = generateProvisionalPassword()
    const passwordHash = await hashPassword(password)
    const existing = await findTeacherByEmail(db, req.email)
    let username: string

    if (req.type === 'registration') {
      if (existing) {
        await setRequestStatus(db, req.id, 'rejected')
        return { ok: false, error: 'Un compte existe déjà pour cet e-mail.' }
      }
      username = await buildUniqueUsername(db, req.email)
      await createTeacher(db, { email: req.email, ...namesFromEmail(req.email), username, passwordHash, role: 'prof', mustChangePassword: true })
    } else {
      if (!existing) {
        await setRequestStatus(db, req.id, 'rejected')
        return { ok: false, error: 'Aucun compte pour cet e-mail.' }
      }
      username = existing.username
      await setTeacherPassword(db, existing.id, passwordHash, true)
    }

    await sendEmail({
      to: req.email,
      subject: 'Vos identifiants — Parcours Scratch',
      text: `Identifiant : ${username}\nMot de passe provisoire : ${password}\nVous devrez le changer à la première connexion.`,
    })
    return { ok: true, username, password }
  } catch (e) {
    await setRequestStatus(db, req.id, 'pending') // la demande reste à traiter
    throw e
  }
}
