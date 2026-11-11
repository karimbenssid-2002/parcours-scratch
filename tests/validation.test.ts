import { describe, expect, it } from 'vitest'
import { emailDomain, isSchoolEmail, namesFromEmail, normalizeEmail } from '@/lib/auth/validation'

describe('isSchoolEmail', () => {
  it.each([
    'emma.test@malraux-rabat.org',
    '  Emma.Test@Malraux-Rabat.org ',
    'marie-anne.el-fictif@malraux-rabat.org',
    'chloe.modele2@malraux-rabat.org',
  ])('accepte %s', (e) => expect(isSchoolEmail(e)).toBe(true))

  it.each([
    'emma@malraux-rabat.org',
    'emma.test@gmail.com',
    'emma.test@malraux-rabat.org.evil.com',
    '.test@malraux-rabat.org',
    'emma..test@malraux-rabat.org',
    'emma.test@',
    '',
  ])('refuse %s', (e) => expect(isSchoolEmail(e)).toBe(false))

  it('accepte une liste de domaines', () => {
    const both = ['malraux-rabat.org', 'mlfmonde.org']
    expect(isSchoolEmail('bob.modele@mlfmonde.org')).toBe(false)
    expect(isSchoolEmail('Bob.Modele@MLFmonde.org', both)).toBe(true)
    expect(isSchoolEmail('bob.modele@malraux-rabat.org', both)).toBe(true)
    expect(isSchoolEmail('bob.modele@gmail.com', both)).toBe(false)
  })
})

describe('emailDomain', () => {
  it('rend le domaine en minuscules, ou null', () => {
    expect(emailDomain(' Bob.Modele@MLFmonde.org ')).toBe('mlfmonde.org')
    expect(emailDomain('@malraux-rabat.org')).toBeNull()
    expect(emailDomain('bob.modele@')).toBeNull()
    expect(emailDomain('bob.modele')).toBeNull()
  })
})

describe('normalizeEmail', () => {
  it('met en minuscules et retire les espaces', () => {
    expect(normalizeEmail('  Emma.Test@Malraux-Rabat.org ')).toBe('emma.test@malraux-rabat.org')
  })
})

describe('namesFromEmail', () => {
  it('déduit prénom et nom, noms composés et chiffres finaux', () => {
    expect(namesFromEmail('emma.test@malraux-rabat.org')).toEqual({ firstName: 'Emma', lastName: 'Test' })
    expect(namesFromEmail('marie-anne.el-fictif@malraux-rabat.org')).toEqual({ firstName: 'Marie-Anne', lastName: 'El-Fictif' })
    expect(namesFromEmail('chloe.modele2@malraux-rabat.org')).toEqual({ firstName: 'Chloe', lastName: 'Modele' })
  })
})
