import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { seedAdmin } from '@/lib/seed/admin'
import { findTeacherByEmail } from '@/lib/db/teachers'

describe('seedAdmin', () => {
  it('crée le compte admin une seule fois, avec changement forcé', async () => {
    const db = await testDb()
    expect(await seedAdmin(db, { email: 'Admin.Test@malraux-rabat.org', password: 'initial-2026' })).toBe('created')
    expect(await seedAdmin(db, { email: 'admin.test@malraux-rabat.org', password: 'autre' })).toBe('exists')
    expect(await findTeacherByEmail(db, 'admin.test@malraux-rabat.org')).toMatchObject({
      role: 'admin', username: 'admin.test', mustChangePassword: true,
    })
  })

  it("refuse le mot de passe d'exemple de .env.example (public)", async () => {
    const db = await testDb()
    await expect(seedAdmin(db, { email: 'admin.test@malraux-rabat.org', password: 'changer-moi-2026' })).rejects.toThrow(/exemple/)
    expect(await findTeacherByEmail(db, 'admin.test@malraux-rabat.org')).toBeNull()
  })

  it('refuse un mot de passe de moins de 12 caractères', async () => {
    const db = await testDb()
    await expect(seedAdmin(db, { email: 'admin.test@malraux-rabat.org', password: 'court-2026' })).rejects.toThrow(/12 caractères/)
    expect(await findTeacherByEmail(db, 'admin.test@malraux-rabat.org')).toBeNull()
  })
})
