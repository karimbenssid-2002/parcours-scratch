export const SCHOOL_DOMAIN = 'malraux-rabat.org'

const LOCAL_PART = /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*\d*$/

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Adresse de l'établissement au format prenom.nom@malraux-rabat.org */
export function isSchoolEmail(email: string): boolean {
  const e = normalizeEmail(email)
  const at = e.lastIndexOf('@')
  if (at <= 0) return false
  return e.slice(at + 1) === SCHOOL_DOMAIN && LOCAL_PART.test(e.slice(0, at))
}

const capitalize = (part: string) =>
  part.split('-').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('-')

export function namesFromEmail(email: string): { firstName: string; lastName: string } {
  const local = normalizeEmail(email).split('@')[0]
  const [first = '', last = ''] = local.split('.')
  return { firstName: capitalize(first), lastName: capitalize(last.replace(/\d+$/, '')) }
}

export function isValidPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 128
}
