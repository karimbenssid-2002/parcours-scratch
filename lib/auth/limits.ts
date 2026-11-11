import type { DB } from '@/lib/db/client'
import { tooManyAttempts } from './rate-limit'

// Les élèves d'un collège sortent tous par la même IP (NAT) : les plafonds par IP doivent être larges.
// Un compteur par compte, indépendant de l'IP (l'en-tête X-Forwarded-For peut être falsifié), limite les demandes de compte.
const WINDOW = 15 * 60_000

// `request` : demandes de compte enseignant. `google` : retours de la page Google (/auth/google/callback) ; Google prouve
// l'identité : pas de compteur par compte, seulement un plafond par IP large (toute une classe se connecte en même temps).
type Kind = 'request' | 'google'

const PER_ACCOUNT: Record<Kind, number | null> = { request: 3, google: null }
const PER_IP: Record<Kind, number | null> = { request: 100, google: 300 }

/** Enregistre une tentative ; true si elle doit être refusée. */
export async function isBlocked(db: DB, kind: Kind, subject: { ip: string; account?: string }): Promise<boolean> {
  const accountMax = PER_ACCOUNT[kind]
  const ipMax = PER_IP[kind]
  const byAccount = accountMax !== null && subject.account !== undefined
    && await tooManyAttempts(db, `${kind}:account:${subject.account}`, accountMax, WINDOW)
  const byIp = ipMax !== null && await tooManyAttempts(db, `${kind}:ip:${subject.ip}`, ipMax, WINDOW)
  return byAccount || byIp
}
