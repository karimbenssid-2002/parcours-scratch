import { fold } from '@/lib/text'

export type PersonNames = { firstNames: string[]; lastNames: string[] }
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g

/** Masque prénoms/noms (mots entiers, sans accents ni casse) et e-mails. Les autres noms (costumes, sons) restent. */
export function sanitizeForAi(text: string, names: PersonNames): string {
  let out = text.replace(EMAIL, '[e-mail]')
  const words = (list: string[], label: string) => {
    // Chaque partie d'un nom composé (« Anne-Exemple », « N'Fictif », « Ben Essai ») est masquée séparément.
    const wanted = new Set(list.flatMap((n) => fold(n).split(/[^\p{L}\p{M}]+/u)).filter((n) => n.length >= 2))
    out = out.replace(/[\p{L}\p{M}]+/gu, (w) => (wanted.has(fold(w)) ? label : w))
  }
  words(names.firstNames, '[prénom]')
  words(names.lastNames, '[nom]')
  return out
}
