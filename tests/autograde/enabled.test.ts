import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ensureWorker = vi.fn()
vi.mock('@/lib/autograde/worker', () => ({ ensureWorker }))
vi.mock('@/lib/auth/session', () => ({ requireTeacher: async () => ({ id: 'prof', role: 'admin' }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db/client', () => ({ getDb: () => { throw new Error('la base ne doit pas être touchée') } }))

const MESSAGE = 'Correction automatique non disponible sur ce site.'
const UUID = '11111111-1111-4111-8111-111111111111'

describe('correction automatique désactivable', () => {
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = { enabled: process.env.AUTOGRADE_ENABLED, key: process.env.ANTHROPIC_API_KEY, fake: process.env.AUTOGRADE_FAKE_AI, runtime: process.env.NEXT_RUNTIME }
    delete process.env.AUTOGRADE_ENABLED; delete process.env.AUTOGRADE_FAKE_AI
    process.env.ANTHROPIC_API_KEY = 'sk-test'; process.env.NEXT_RUNTIME = 'nodejs'
    ensureWorker.mockClear()
  })
  afterEach(() => {
    const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    restore('AUTOGRADE_ENABLED', saved.enabled); restore('ANTHROPIC_API_KEY', saved.key)
    restore('AUTOGRADE_FAKE_AI', saved.fake); restore('NEXT_RUNTIME', saved.runtime)
  })

  it('autogradeEnabled ne vaut vrai que pour AUTOGRADE_ENABLED=1', async () => {
    const { autogradeEnabled } = await import('@/lib/autograde/enabled')
    expect(autogradeEnabled()).toBe(false)
    process.env.AUTOGRADE_ENABLED = 'true'
    expect(autogradeEnabled()).toBe(false)
    process.env.AUTOGRADE_ENABLED = '1'
    expect(autogradeEnabled()).toBe(true)
  })

  it('build sans correction automatique (AUTOGRADE_AU_BUILD « 0 ») : désactivée même avec AUTOGRADE_ENABLED=1, actions refusées', async () => {
    process.env.AUTOGRADE_ENABLED = '1'
    vi.stubEnv('AUTOGRADE_AU_BUILD', '0')
    try {
      const { autogradeEnabled } = await import('@/lib/autograde/enabled')
      expect(autogradeEnabled()).toBe(false)
      const revue = await import('@/app/admin/(espace)/revue/[progressId]/autograde-actions')
      const activite = await import('@/app/admin/(espace)/activites/[activityId]/autograde-actions')
      expect(await revue.startCorrectionAction(UUID, 'propose')).toEqual({ error: MESSAGE })
      expect(await activite.testAutogradeAction(UUID)).toEqual({ error: MESSAGE })
      expect(ensureWorker).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('isAiConfigured vaut faux sans le drapeau, même avec une clé d’API ou le client factice', async () => {
    const { isAiConfigured } = await import('@/lib/autograde/ai')
    expect(isAiConfigured()).toBe(false)
    process.env.AUTOGRADE_FAKE_AI = '1'
    expect(isAiConfigured()).toBe(false)
    process.env.AUTOGRADE_ENABLED = '1'
    expect(isAiConfigured()).toBe(true)
  })

  it('le worker ne démarre pas sans le drapeau', async () => {
    const { register } = await import('../../instrumentation')
    await register()
    expect(ensureWorker).not.toHaveBeenCalled()
    process.env.AUTOGRADE_ENABLED = '1'
    await register()
    expect(ensureWorker).toHaveBeenCalledTimes(1)
  })

  it('toutes les actions qui lancent une correction refusent sans le drapeau', async () => {
    const revue = await import('@/app/admin/(espace)/revue/[progressId]/autograde-actions')
    const classe = await import('@/app/admin/(espace)/a-valider/autograde-actions')
    const activite = await import('@/app/admin/(espace)/activites/[activityId]/autograde-actions')
    expect(await revue.startCorrectionAction(UUID, 'propose')).toEqual({ error: MESSAGE })
    expect(await revue.startCorrectionAction(UUID, 'send')).toEqual({ error: MESSAGE })
    expect(await classe.startClassCorrectionAction(UUID, 'propose')).toEqual({ error: MESSAGE })
    expect(await activite.testAutogradeAction(UUID)).toEqual({ error: MESSAGE })
    expect(await revue.correctionStatusAction(UUID)).toBeNull()
    expect(await classe.classCorrectionStatusAction(UUID)).toBeNull()
    expect(ensureWorker).not.toHaveBeenCalled()
  })
})
