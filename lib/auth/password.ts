import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** 12 caractères base64url (72 bits d'entropie). */
export function generateProvisionalPassword(): string {
  return crypto.randomBytes(9).toString('base64url')
}
