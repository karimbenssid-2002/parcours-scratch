import { describe, expect, it } from 'vitest'

describe('outillage', () => {
  it('charge les variables de test', () => {
    expect(process.env.AUTH_SECRET?.length).toBeGreaterThanOrEqual(32)
  })
})
