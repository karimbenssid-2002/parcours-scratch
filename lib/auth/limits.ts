import type { DB } from '@/lib/db/client'
import { resetAttempts, tooManyAttempts } from './rate-limit'

// Les élèves d'un collège sortent tous par la même IP (NAT) : les plafonds par IP doivent être larges.
// La protection contre le bourrage de mots de passe repose sur un compteur par compte, indépendant de l'IP
// (l'en-tête X-Forwarded-For peut être falsifié).
const WINDOW = 15 * 60_000

type Kind = 'login' | 'register' | 'check' | 'request'

const PER_ACCOUNT: Record<Kind, number | null> = { login: 10, register: 5, check: null, request: 3 }
const PER_IP: Record<Kind, number | null> = { login: null, register: 300, check: 600, request: 100 }

/** Enregistre une tentative ; true si elle doit être refusée. */
export async function isBlocked(db: DB, kind: Kind, subject: { ip: string; account?: string }): Promise<boolean> {
  const accountMax = PER_ACCOUNT[kind]
  const ipMax = PER_IP[kind]
  const byAccount = accountMax !== null && subject.account !== undefined
    && await tooManyAttempts(db, `${kind}:account:${subject.account}`, accountMax, WINDOW)
  const byIp = ipMax !== null && await tooManyAttempts(db, `${kind}:ip:${subject.ip}`, ipMax, WINDOW)
  return byAccount || byIp
}

export async function clearLoginAttempts(db: DB, account: string): Promise<void> {
  await resetAttempts(db, `login:account:${account}`)
}
