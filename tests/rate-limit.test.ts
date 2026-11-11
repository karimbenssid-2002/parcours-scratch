import { beforeEach, describe, expect, it } from 'vitest'
import { RETENTION_MS, resetAttempts, tooManyAttempts } from '@/lib/auth/rate-limit'
import type { DB } from '@/lib/db/client'
import { loginAttempts } from '@/lib/db/schema'
import { testDb } from './helpers/db'

let db: DB
beforeEach(async () => { db = await testDb() }, 30_000)

describe('tooManyAttempts', () => {
  it('bloque après max tentatives dans la fenêtre puis se libère', async () => {
    for (let i = 0; i < 3; i++) expect(await tooManyAttempts(db, 'k', 3, 1000, 0)).toBe(false)
    expect(await tooManyAttempts(db, 'k', 3, 1000, 10)).toBe(true)
    expect(await tooManyAttempts(db, 'k', 3, 1000, 2000)).toBe(false)
  })
  it('compte 10 essais par 15 minutes par défaut, puis bloque', async () => {
    for (let i = 0; i < 10; i++) expect(await tooManyAttempts(db, 'k')).toBe(false)
    expect(await tooManyAttempts(db, 'k')).toBe(true)
  })
  it('compte chaque clé séparément', async () => {
    for (let i = 0; i < 3; i++) await tooManyAttempts(db, 'a', 3, 1000, 0)
    expect(await tooManyAttempts(db, 'a', 3, 1000, 1)).toBe(true)
    expect(await tooManyAttempts(db, 'b', 3, 1000, 1)).toBe(false)
  })
  it('20 tentatives simultanées : au plus max passent', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => tooManyAttempts(db, 'k', 10)))
    expect(results.filter((blocked) => !blocked).length).toBeLessThanOrEqual(10)
  })
  it('purge toutes les clés au-delà de la rétention et stocke une clé de longueur fixe', async () => {
    await tooManyAttempts(db, 'ancienne', 3, 1000, 0)
    await tooManyAttempts(db, 'x'.repeat(5000), 3, 1000, RETENTION_MS + 1)
    const rows = await db.select().from(loginAttempts)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toHaveLength(64)
  })
  it("un appel à fenêtre courte ne supprime pas la ligne d'une autre clé à fenêtre plus longue", async () => {
    const now = 100 * 60_000
    await tooManyAttempts(db, 'longue', 1, 15 * 60_000, now - 10 * 60_000)
    await tooManyAttempts(db, 'courte', 5, 60_000, now)
    expect(await tooManyAttempts(db, 'longue', 1, 15 * 60_000, now)).toBe(true)
  })
  it("les tentatives refusées ne prolongent pas le blocage et ne restent pas en base", async () => {
    const count = async () => (await db.select().from(loginAttempts)).length
    for (let i = 0; i < 3; i++) expect(await tooManyAttempts(db, 'k', 3, 1000, i)).toBe(false)
    for (let t = 10; t < 510; t += 10) {
      expect(await tooManyAttempts(db, 'k', 3, 1000, t)).toBe(true)
      expect(await count()).toBeLessThanOrEqual(3)
    }
    // la plus ancienne tentative acceptée (t = 0) expire à t = 1000, malgré les 50 refus
    expect(await tooManyAttempts(db, 'k', 3, 1000, 1001)).toBe(false)
  })
  it('se réinitialise après un succès', async () => {
    for (let i = 0; i < 3; i++) await tooManyAttempts(db, 'k', 3, 1000, 0)
    await resetAttempts(db, 'k')
    expect(await tooManyAttempts(db, 'k', 3, 1000, 1)).toBe(false)
  })
})
