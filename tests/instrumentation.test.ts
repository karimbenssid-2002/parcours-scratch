import { afterEach, describe, expect, it, vi } from 'vitest'

const ensureWorker = vi.fn()
vi.mock('@/lib/autograde/worker', () => ({ ensureWorker }))

describe('démarrage du serveur', () => {
  afterEach(() => { ensureWorker.mockClear(); delete process.env.NEXT_RUNTIME })

  it('démarre la correction automatique en arrière-plan (reprise après redémarrage)', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    const { register } = await import('../instrumentation')
    await register()
    expect(ensureWorker).toHaveBeenCalledTimes(1)
  })

  it('ne la démarre pas hors de Node.js', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    const { register } = await import('../instrumentation')
    await register()
    expect(ensureWorker).not.toHaveBeenCalled()
  })

  it('ne la démarre pas si le build est sans correction automatique (AUTOGRADE_AU_BUILD remplacé par « 0 »)', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    vi.stubEnv('AUTOGRADE_AU_BUILD', '0')
    try {
      const { register } = await import('../instrumentation')
      await register()
      expect(ensureWorker).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
