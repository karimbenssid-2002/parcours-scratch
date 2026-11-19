import { describe, expect, it } from 'vitest'
import { checkGoogleIdentity, exactAddressNotice, STUDENT_DOMAINS, TEACHER_DOMAINS, teacherIdentity } from '@/lib/auth/identity'

const id = (email: string, hd: string | null, emailVerified = true) => ({ email, emailVerified, hd })

describe('domaines', () => {
  it('élève : malraux-rabat.org seul ; enseignant : les deux domaines', () => {
    expect([...STUDENT_DOMAINS]).toEqual(['malraux-rabat.org'])
    expect([...TEACHER_DOMAINS]).toEqual(['malraux-rabat.org', 'mlfmonde.org'])
  })
})

describe('checkGoogleIdentity — élève', () => {
  it('accepte une adresse du collège vérifiée', () => {
    expect(checkGoogleIdentity(id('alice.exemple@malraux-rabat.org', 'malraux-rabat.org'), 'eleve'))
      .toEqual({ ok: true, email: 'alice.exemple@malraux-rabat.org' })
  })

  it("rend l'adresse en minuscules", () => {
    expect(checkGoogleIdentity(id('ALICE.Exemple@Malraux-Rabat.org', 'malraux-rabat.org'), 'eleve'))
      .toEqual({ ok: true, email: 'alice.exemple@malraux-rabat.org' })
  })

  it('refuse une adresse @mlfmonde.org', () => {
    expect(checkGoogleIdentity(id('alice.exemple@mlfmonde.org', 'mlfmonde.org'), 'eleve'))
      .toEqual({ ok: false, reason: 'domaine' })
  })

  it('refuse un compte Gmail (hd absent)', () => {
    expect(checkGoogleIdentity(id('alice.exemple@gmail.com', null), 'eleve')).toEqual({ ok: false, reason: 'domaine' })
  })

  it('refuse une adresse non vérifiée', () => {
    expect(checkGoogleIdentity(id('alice.exemple@malraux-rabat.org', 'malraux-rabat.org', false), 'eleve'))
      .toEqual({ ok: false, reason: 'non-verifiee' })
  })

  it("refuse un hd étranger même si l'adresse est du collège", () => {
    expect(checkGoogleIdentity(id('alice.exemple@malraux-rabat.org', 'autre.org'), 'eleve'))
      .toEqual({ ok: false, reason: 'domaine' })
  })

  it('refuse une adresse du collège sans hd', () => {
    expect(checkGoogleIdentity(id('alice.exemple@malraux-rabat.org', null), 'eleve'))
      .toEqual({ ok: false, reason: 'domaine' })
  })

  it('refuse un sous-domaine ou un domaine qui se termine pareil', () => {
    expect(checkGoogleIdentity(id('alice.exemple@eleves.malraux-rabat.org', 'malraux-rabat.org'), 'eleve').ok).toBe(false)
    expect(checkGoogleIdentity(id('alice.exemple@faux-malraux-rabat.org', 'malraux-rabat.org'), 'eleve').ok).toBe(false)
  })
})

describe('checkGoogleIdentity — enseignant', () => {
  it('accepte les deux domaines', () => {
    expect(checkGoogleIdentity(id('bob.modele@malraux-rabat.org', 'malraux-rabat.org'), 'enseignant'))
      .toEqual({ ok: true, email: 'bob.modele@malraux-rabat.org' })
    expect(checkGoogleIdentity(id('Bob.Modele@mlfmonde.org', 'mlfmonde.org'), 'enseignant'))
      .toEqual({ ok: true, email: 'bob.modele@mlfmonde.org' })
  })

  it('accepte @mlfmonde.org quand hd vaut le domaine principal (domaine secondaire)', () => {
    expect(checkGoogleIdentity(id('bob.modele@mlfmonde.org', 'malraux-rabat.org'), 'enseignant'))
      .toEqual({ ok: true, email: 'bob.modele@mlfmonde.org' })
  })

  it('refuse un autre domaine, un hd étranger ou une adresse non vérifiée', () => {
    expect(checkGoogleIdentity(id('bob.modele@gmail.com', null), 'enseignant')).toEqual({ ok: false, reason: 'domaine' })
    expect(checkGoogleIdentity(id('bob.modele@mlfmonde.org', 'autre.org'), 'enseignant')).toEqual({ ok: false, reason: 'domaine' })
    expect(checkGoogleIdentity(id('bob.modele@mlfmonde.org', 'mlfmonde.org', false), 'enseignant'))
      .toEqual({ ok: false, reason: 'non-verifiee' })
  })
})

describe('exactAddressNotice', () => {
  it("ne nomme que l'adresse exacte de la demande, jamais celle de l'autre domaine", () => {
    expect(exactAddressNotice('Chloe.Essai@mlfmonde.org')).toBe(
      'Valider ouvre ce compte à la seule adresse chloe.essai@mlfmonde.org : ce collègue se connectera avec elle, et avec aucune autre.')
    expect(exactAddressNotice('chloe.essai@malraux-rabat.org')).toContain('chloe.essai@malraux-rabat.org')
    expect(exactAddressNotice('chloe.essai@malraux-rabat.org')).not.toContain('mlfmonde.org')
    expect(exactAddressNotice('chloe.essai@mlfmonde.org')).not.toContain('malraux-rabat.org')
  })
})

describe('teacherIdentity', () => {
  it('rend la partie avant le @, en minuscules', () => {
    expect(teacherIdentity('Bob.Modele@mlfmonde.org')).toBe('bob.modele')
    expect(teacherIdentity(' bob.modele@Malraux-Rabat.org ')).toBe('bob.modele')
  })
})
