import { beforeEach, describe, expect, it } from 'vitest'
import { isBlocked, clearLoginAttempts } from '@/lib/auth/limits'
import type { DB } from '@/lib/db/client'
import { testDb } from './helpers/db'

let db: DB
beforeEach(async () => { db = await testDb() }, 30_000)

const rnd = () => Math.random().toString(36).slice(2)

describe('limites de tentatives', () => {
  it("laisse 60 élèves d'une même IP (NAT du collège) vérifier leur e-mail et s'inscrire", async () => {
    const ip = 'ip-' + rnd()
    for (let i = 0; i < 60; i++) {
      const account = `eleve.n${rnd()}@malraux-rabat.org`
      expect(await isBlocked(db, 'check', { ip })).toBe(false)
      expect(await isBlocked(db, 'register', { ip, account })).toBe(false)
    }
  })

  it("bloque le bourrage de mots de passe sur un compte même si l'IP change à chaque essai", async () => {
    const account = `cible.${rnd()}@malraux-rabat.org`
    for (let i = 0; i < 10; i++) expect(await isBlocked(db, 'login', { ip: rnd(), account })).toBe(false)
    expect(await isBlocked(db, 'login', { ip: rnd(), account })).toBe(true)
  })

  it('une connexion réussie remet le compteur du compte à zéro', async () => {
    const account = `eleve.${rnd()}@malraux-rabat.org`
    for (let i = 0; i < 10; i++) await isBlocked(db, 'login', { ip: 'x', account })
    await clearLoginAttempts(db, account)
    expect(await isBlocked(db, 'login', { ip: 'x', account })).toBe(false)
  })

  it("laisse toute la salle des profs (même IP) demander un compte, mais pas 10 fois le même e-mail", async () => {
    const ip = 'ip-' + rnd()
    for (let i = 0; i < 40; i++) expect(await isBlocked(db, 'request', { ip, account: `prof.n${rnd()}@malraux-rabat.org` })).toBe(false)
    const account = `prof.${rnd()}@malraux-rabat.org`
    for (let i = 0; i < 3; i++) expect(await isBlocked(db, 'request', { ip: rnd(), account })).toBe(false)
    expect(await isBlocked(db, 'request', { ip: rnd(), account })).toBe(true)
  })
})
