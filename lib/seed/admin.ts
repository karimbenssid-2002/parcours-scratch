import type { DB } from '@/lib/db/client'
import { createTeacher, findTeacherByEmail, findTeacherByUsername } from '@/lib/db/teachers'
import { teacherIdentity } from '@/lib/auth/identity'
import { namesFromEmail, normalizeEmail } from '@/lib/auth/validation'

/**
 * Crée le compte admin (sans mot de passe : connexion avec Google, par cette adresse exacte) s'il n'existe aucun compte
 * de cette adresse ; un compte existant n'est jamais modifié.
 */
export async function seedAdmin(db: DB, opts: { email: string }): Promise<'created' | 'exists'> {
  const email = normalizeEmail(opts.email)
  if (await findTeacherByEmail(db, email)) return 'exists'
  const username = teacherIdentity(email)
  if (await findTeacherByUsername(db, username)) {
    throw new Error(`Un compte d'identifiant ${username} existe déjà avec une autre adresse : compte admin non créé.`)
  }
  await createTeacher(db, { email, ...namesFromEmail(email), username, role: 'admin' })
  return 'created'
}
