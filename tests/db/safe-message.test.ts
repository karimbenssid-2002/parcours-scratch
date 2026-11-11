import { describe, expect, it } from 'vitest'
import { safeMessage } from '@/lib/db/safe-message'

const URL_BASE = 'postgresql://postgres.abc:mot-de-passe@db.example.org:6543/postgres'

describe('safeMessage', () => {
  it("garde le message seul, sans l'adresse ni le mot de passe", () => {
    expect(safeMessage(new Error(`connexion à ${URL_BASE} impossible`), URL_BASE)).toBe('connexion à [DATABASE_URL] impossible')
    expect(safeMessage(new Error('auth échouée pour mot-de-passe'), URL_BASE)).toBe('auth échouée pour ***')
    expect(safeMessage('texte', undefined)).toBe('texte')
  })
})
