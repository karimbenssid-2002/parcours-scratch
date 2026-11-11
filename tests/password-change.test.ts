import { describe, expect, it } from 'vitest'
import { checkPasswordChange } from '@/lib/auth/password-change'
import { hashPassword } from '@/lib/auth/password'

describe('checkPasswordChange', () => {
  it("exige le mot de passe actuel quand le changement n'est pas forcé (PC partagé resté connecté)", async () => {
    const passwordHash = await hashPassword('ancien-mdp-1')
    const base = { mustChangePassword: false, passwordHash, password: 'nouveau-mdp-1', confirm: 'nouveau-mdp-1' }
    expect(await checkPasswordChange({ ...base, current: undefined })).toBe('current')
    expect(await checkPasswordChange({ ...base, current: 'mauvais' })).toBe('current')
    expect(await checkPasswordChange({ ...base, current: 'ancien-mdp-1' })).toBeNull()
  })

  it('ne demande pas le mot de passe actuel pendant un changement forcé (mot de passe provisoire)', async () => {
    const passwordHash = await hashPassword('provisoire-1')
    expect(await checkPasswordChange({ mustChangePassword: true, passwordHash, current: undefined, password: 'nouveau-mdp-1', confirm: 'nouveau-mdp-1' })).toBeNull()
  })

  it('refuse un mot de passe trop court ou non confirmé', async () => {
    const passwordHash = await hashPassword('provisoire-1')
    const base = { mustChangePassword: true, passwordHash, current: undefined }
    expect(await checkPasswordChange({ ...base, password: 'court', confirm: 'court' })).toBe('short')
    expect(await checkPasswordChange({ ...base, password: 'nouveau-mdp-1', confirm: 'nouveau-mdp-2' })).toBe('mismatch')
  })
})
