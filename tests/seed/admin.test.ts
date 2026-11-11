import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { seedAdmin } from '@/lib/seed/admin'
import { findTeacherByEmail } from '@/lib/db/teachers'

describe('seedAdmin', () => {
  it('crée le compte admin une seule fois, identifiant = partie avant le @', async () => {
    const db = await testDb()
    expect(await seedAdmin(db, { email: 'Admin.Test@malraux-rabat.org' })).toBe('created')
    expect(await seedAdmin(db, { email: 'admin.test@malraux-rabat.org' })).toBe('exists')
    expect(await findTeacherByEmail(db, 'admin.test@malraux-rabat.org')).toMatchObject({
      role: 'admin', username: 'admin.test',
    })
  })
})
