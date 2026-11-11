import { describe, expect, it } from 'vitest'
import { parseEmailList } from '@/lib/classes/emails'

describe('parseEmailList', () => {
  it('accepte une liste en vrac, normalise, dédoublonne et signale les erreurs', () => {
    const text = `  Alice.Exemple@Malraux-Rabat.org
      bob.modele@malraux-rabat.org, chloe.el-fictif@malraux-rabat.org;
      alice.exemple@malraux-rabat.org

      quelquun@gmail.com	pas-une-adresse`
    expect(parseEmailList(text)).toEqual({
      valid: ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org', 'chloe.el-fictif@malraux-rabat.org'],
      invalid: ['quelquun@gmail.com', 'pas-une-adresse'],
      duplicates: ['alice.exemple@malraux-rabat.org'],
    })
  })

  it('renvoie des listes vides pour un texte vide', () => {
    expect(parseEmailList('  \n ')).toEqual({ valid: [], invalid: [], duplicates: [] })
  })

  it("accepte une liste copiée depuis la messagerie (« Nom <adresse> »)", () => {
    const text = 'Exemple Alice <Alice.Exemple@malraux-rabat.org>; "Modele, Bob" <bob.modele@malraux-rabat.org>, (externe) <x@gmail.com>'
    expect(parseEmailList(text)).toEqual({
      valid: ['alice.exemple@malraux-rabat.org', 'bob.modele@malraux-rabat.org'],
      invalid: ['x@gmail.com'],
      duplicates: [],
    })
  })
})
