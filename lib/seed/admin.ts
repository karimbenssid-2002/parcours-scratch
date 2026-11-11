import type { DB } from '@/lib/db/client'
import { buildUniqueUsername, createTeacher, findTeacherByEmail } from '@/lib/db/teachers'
import { hashPassword } from '@/lib/auth/password'
import { namesFromEmail, normalizeEmail } from '@/lib/auth/validation'

/** Valeur de .env.example : publique, comme l'identifiant (partie locale de l'e-mail), elle ouvrirait le compte admin. */
const EXAMPLE_PASSWORD = 'changer-moi-2026'
const MIN_LENGTH = 12

export function checkInitialPassword(password: string) {
  if (password === EXAMPLE_PASSWORD) {
    throw new Error("ADMIN_INITIAL_PASSWORD : remplacez la valeur d'exemple de .env.example par un mot de passe à vous")
  }
  if (password.length < MIN_LENGTH) throw new Error(`ADMIN_INITIAL_PASSWORD trop court (${MIN_LENGTH} caractères minimum)`)
}

/** Le compte admin de cette adresse sera-t-il créé ? Alors son mot de passe initial doit être acceptable (lève sinon). */
export async function checkAdminToCreate(db: DB, opts: { email: string; password: string }): Promise<void> {
  if (!(await findTeacherByEmail(db, normalizeEmail(opts.email)))) checkInitialPassword(opts.password)
}

/** Crée le compte admin s'il n'existe pas ; le mot de passe n'est vérifié (et utilisé) qu'à la création. */
export async function seedAdmin(db: DB, opts: { email: string; password: string }): Promise<'created' | 'exists'> {
  const email = normalizeEmail(opts.email)
  if (await findTeacherByEmail(db, email)) return 'exists'
  checkInitialPassword(opts.password)
  await createTeacher(db, {
    email, ...namesFromEmail(email), username: await buildUniqueUsername(db, email),
    passwordHash: await hashPassword(opts.password), role: 'admin', mustChangePassword: true,
  })
  return 'created'
}
