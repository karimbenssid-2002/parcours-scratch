import { beforeEach, describe, expect, it } from 'vitest'
import { isBlocked } from '@/lib/auth/limits'
import type { DB } from '@/lib/db/client'
import { testDb } from './helpers/db'

let db: DB
beforeEach(async () => { db = await testDb() }, 30_000)

const rnd = () => Math.random().toString(36).slice(2)

describe('limites de tentatives', () => {
  it("laisse toute la salle des profs (même IP) demander un compte, mais pas 10 fois le même e-mail", async () => {
    const ip = 'ip-' + rnd()
    for (let i = 0; i < 40; i++) expect(await isBlocked(db, 'request', { ip, account: `prof.n${rnd()}@malraux-rabat.org` })).toBe(false)
    const account = `prof.${rnd()}@malraux-rabat.org`
    for (let i = 0; i < 3; i++) expect(await isBlocked(db, 'request', { ip: rnd(), account })).toBe(false)
    expect(await isBlocked(db, 'request', { ip: rnd(), account })).toBe(true)
  })

  it('retour de Google : 300 par IP en 15 min, sans compteur par compte', async () => {
    const ip = 'ip-' + rnd()
    for (let i = 0; i < 300; i++) expect(await isBlocked(db, 'google', { ip, account: 'meme-compte' })).toBe(false)
    expect(await isBlocked(db, 'google', { ip })).toBe(true)
    expect(await isBlocked(db, 'google', { ip: rnd(), account: 'meme-compte' })).toBe(false)
  })
})
