import { isSchoolEmail, normalizeEmail } from '@/lib/auth/validation'

export type ParsedEmails = { valid: string[]; invalid: string[]; duplicates: string[] }

/**
 * Découpe une liste collée : une adresse par ligne, ou séparées par des virgules, points-virgules ou espaces,
 * y compris le format des messageries (« Exemple Alice <alice.exemple@…> ; "Modele, Bob" <…> »).
 */
export function parseEmailList(text: string): ParsedEmails {
  const result: ParsedEmails = { valid: [], invalid: [], duplicates: [] }
  // Les noms entre guillemets ou parenthèses peuvent contenir des virgules : on les retire d'abord.
  const cleaned = text.replace(/"[^"]*"/g, ' ').replace(/\([^)]*\)/g, ' ')
  for (const entry of cleaned.split(/[\r\n,;]+/)) {
    const bracketed = [...entry.matchAll(/<([^>]*)>/g)].map((m) => m[1])
    // « Nom <adresse> » : seule l'adresse compte ; sinon chaque mot est une adresse candidate.
    const candidates = bracketed.length > 0 ? bracketed : entry.split(/\s+/)
    for (const raw of candidates) {
      if (!raw.trim()) continue
      const email = normalizeEmail(raw)
      if (!isSchoolEmail(email)) result.invalid.push(raw.trim())
      else if (result.valid.includes(email)) result.duplicates.push(email)
      else result.valid.push(email)
    }
  }
  return result
}
