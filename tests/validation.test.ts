import { describe, expect, it } from 'vitest'
import { isSchoolEmail, isValidPassword, namesFromEmail, normalizeEmail } from '@/lib/auth/validation'

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

describe('isValidPassword', () => {
  it('impose 8 à 128 caractères', () => {
    expect(isValidPassword('1234567')).toBe(false)
    expect(isValidPassword('12345678')).toBe(true)
    expect(isValidPassword('x'.repeat(129))).toBe(false)
    expect(isValidPassword(null)).toBe(false)
  })
})
