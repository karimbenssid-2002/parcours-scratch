import { emailDomain, normalizeEmail, SCHOOL_DOMAIN } from '@/lib/auth/validation'

/** Domaines acceptés pour un compte élève. */
export const STUDENT_DOMAINS = [SCHOOL_DOMAIN] as const satisfies readonly string[]
/** Domaines acceptés pour un compte enseignant (et l'administrateur). */
export const TEACHER_DOMAINS = [SCHOOL_DOMAIN, 'mlfmonde.org'] as const satisfies readonly string[]
/** Domaines hébergés (`hd` du jeton Google) acceptés, quel que soit le rôle. */
const HOSTED_DOMAINS: readonly string[] = TEACHER_DOMAINS

export type LoginKind = 'eleve' | 'enseignant'

/** Ce que Google affirme du compte, lu dans le jeton d'identité vérifié. */
export type GoogleIdentity = { email: string; emailVerified: boolean; hd: string | null }

export type IdentityCheck = { ok: true; email: string } | { ok: false; reason: 'domaine' | 'non-verifiee' }

/**
 * Exige les trois preuves : adresse vérifiée par Google, domaine de l'adresse dans la liste du rôle,
 * et domaine hébergé (`hd`) présent et dans {malraux-rabat.org, mlfmonde.org}. L'adresse rendue est en minuscules.
 */
export function checkGoogleIdentity(id: GoogleIdentity, kind: LoginKind): IdentityCheck {
  if (id.emailVerified !== true) return { ok: false, reason: 'non-verifiee' }
  const email = normalizeEmail(id.email)
  const domain = email.split('@').length === 2 ? emailDomain(email) : null
  const allowed: readonly string[] = kind === 'eleve' ? STUDENT_DOMAINS : TEACHER_DOMAINS
  if (domain === null || !allowed.includes(domain)) return { ok: false, reason: 'domaine' }
  if (id.hd === null || !HOSTED_DOMAINS.includes(id.hd.toLowerCase())) return { ok: false, reason: 'domaine' }
  return { ok: true, email }
}

/**
 * Identité d'un enseignant : la partie avant le @ de l'adresse, en minuscules, quel que soit le domaine. Pour un compte,
 * c'est la partie avant le @ de `teachers.email`, jamais `teachers.username` (qui peut porter un suffixe numérique
 * « prenom.nom2 » sans rapport avec l'adresse). Elle ne sert qu'à l'identifiant, à la limite des demandes et à la règle
 * « un seul compte par personne » ; jamais à la connexion, qui exige l'adresse exacte (teacherGoogleLogin).
 */
export function teacherIdentity(email: string): string {
  const e = normalizeEmail(email)
  const at = e.lastIndexOf('@')
  return at < 0 ? e : e.slice(0, at)
}

/**
 * Rappel d'une demande de compte enseignant : le compte validé ne s'ouvre qu'avec l'adresse exacte de la demande
 * (aucune équivalence entre les deux domaines, voir teacherGoogleLogin).
 */
export function exactAddressNotice(requestEmail: string): string {
  return `Valider ouvre ce compte à la seule adresse ${normalizeEmail(requestEmail)} : ce collègue se connectera avec elle, et avec aucune autre.`
}
