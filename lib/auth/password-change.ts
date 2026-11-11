import { verifyPassword } from './password'
import { isValidPassword } from './validation'

export type PasswordChangeError = 'current' | 'short' | 'mismatch'

/**
 * Règles communes élèves / enseignants. Hors changement forcé (mot de passe provisoire),
 * le mot de passe actuel est exigé : sinon une session restée ouverte sur un PC partagé
 * suffirait à voler le compte.
 */
export async function checkPasswordChange(input: {
  mustChangePassword: boolean; passwordHash: string; current: unknown; password: unknown; confirm: unknown
}): Promise<PasswordChangeError | null> {
  if (!input.mustChangePassword) {
    if (typeof input.current !== 'string' || !(await verifyPassword(input.current, input.passwordHash))) return 'current'
  }
  if (!isValidPassword(input.password)) return 'short'
  if (input.password !== input.confirm) return 'mismatch'
  return null
}
