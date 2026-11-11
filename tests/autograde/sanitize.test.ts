import { describe, expect, it } from 'vitest'
import { sanitizeForAi } from '@/lib/autograde/sanitize'

const names = { firstNames: ['Alice', 'Élise', 'Farid'], lastNames: ['Exemple', 'Demo'] }

describe('nettoyage', () => {
  it('masque prénoms et noms de la classe, sans accents ni casse, en mots entiers', () => {
    expect(sanitizeForAi('dire « Bonjour je suis ALICE exemple »', names)).toBe('dire « Bonjour je suis [prénom] [nom] »')
    expect(sanitizeForAi('# Lutin : elise-chat', names)).toBe('# Lutin : [prénom]-chat')
    expect(sanitizeForAi('Aliceane et Faridon restent', names)).toBe('Aliceane et Faridon restent')
  })
  it('masque chaque partie d’un prénom ou d’un nom composé', () => {
    const composed = { firstNames: ['Anne-Exemple', 'Alpha Beta'], lastNames: ["N'Fictif", 'Ben Essai'] }
    expect(sanitizeForAi('dire « Anne-Exemple N’Fictif et alpha beta BEN ESSAI »', composed))
      .toBe('dire « [prénom]-[prénom] N’[nom] et [prénom] [prénom] [nom] [nom] »') // une lettre isolée reste (variables x, n…)
  })

  it('masque les e-mails, même hors de la classe', () => {
    expect(sanitizeForAi('contact: x.y@malraux-rabat.org', names)).toBe('contact: [e-mail]')
  })
  it('laisse les noms de costumes et de sons sans prénom', () => {
    expect(sanitizeForAi('costumes : chat-a, chat-b ; sons : Meow', names)).toBe('costumes : chat-a, chat-b ; sons : Meow')
  })
})
