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
 * « prenom.nom2 » sans rapport avec l'adresse).
 */
export function teacherIdentity(email: string): string {
  const e = normalizeEmail(email)
  const at = e.lastIndexOf('@')
  return at < 0 ? e : e.slice(0, at)
}

/**
 * Avertissement d'une demande de compte enseignant : la règle des homonymes ouvre le compte validé à `prenom.nom` sur
 * les deux domaines (TEACHER_DOMAINS), quel que soit celui de la demande.
 */
export function bothAddressesWarning(requestEmail: string): string {
  const [a, b] = TEACHER_DOMAINS.map((d) => `${teacherIdentity(requestEmail)}@${d}`)
  return `Valider ouvre ce compte aux deux adresses ${a} et ${b} : vérifiez que ce collègue possède bien les deux.`
}
