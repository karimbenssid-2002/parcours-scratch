export const SCHOOL_DOMAIN = 'malraux-rabat.org'

const LOCAL_PART = /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*\d*$/

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Domaine d'une adresse (en minuscules), ou null si l'adresse n'a pas la forme partie@domaine. */
export function emailDomain(email: string): string | null {
  const e = normalizeEmail(email)
  const at = e.lastIndexOf('@')
  if (at <= 0 || at === e.length - 1) return null
  return e.slice(at + 1)
}

/** Adresse de l'établissement au format prenom.nom@<domaine>, parmi `domains` (par défaut malraux-rabat.org). */
export function isSchoolEmail(email: string, domains: readonly string[] = [SCHOOL_DOMAIN]): boolean {
  const domain = emailDomain(email)
  if (domain === null || !domains.includes(domain)) return false
  const e = normalizeEmail(email)
  return LOCAL_PART.test(e.slice(0, e.lastIndexOf('@')))
}

const capitalize = (part: string) =>
  part.split('-').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('-')

export function namesFromEmail(email: string): { firstName: string; lastName: string } {
  const local = normalizeEmail(email).split('@')[0]
  const [first = '', last = ''] = local.split('.')
  return { firstName: capitalize(first), lastName: capitalize(last.replace(/\d+$/, '')) }
}
