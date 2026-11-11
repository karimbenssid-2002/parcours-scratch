import { describe, expect, it } from 'vitest'
import { generateProvisionalPassword, hashPassword, verifyPassword } from '@/lib/auth/password'

describe('mots de passe', () => {
  it('hache puis vérifie', async () => {
    const hash = await hashPassword('secret-123')
    expect(hash).not.toContain('secret-123')
    expect(await verifyPassword('secret-123', hash)).toBe(true)
    expect(await verifyPassword('mauvais', hash)).toBe(false)
  })

  it('génère des mots de passe provisoires de 12 caractères, différents', () => {
    const a = generateProvisionalPassword()
    const b = generateProvisionalPassword()
    expect(a).toHaveLength(12)
    expect(a).not.toBe(b)
  })
})
