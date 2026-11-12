import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const scheduleDrain = vi.fn()
vi.mock('@/lib/autograde/launch', () => ({ scheduleDrain, pollSafetyNet: vi.fn() }))
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
    scheduleDrain.mockClear()
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
      expect(scheduleDrain).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('service d’exécution distant (AUTOGRADE_RUNNER_URL) : active même sans Chromium au build, mais jamais sans AUTOGRADE_ENABLED=1', async () => {
    vi.stubEnv('AUTOGRADE_AU_BUILD', '0')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', 'https://service.invalid')
    try {
      const { autogradeEnabled } = await import('@/lib/autograde/enabled')
      expect(autogradeEnabled()).toBe(false)
      process.env.AUTOGRADE_ENABLED = '1'
      expect(autogradeEnabled()).toBe(false) // adresse sans clé de compte de service : pas configuré
      vi.stubEnv('AUTOGRADE_RUNNER_SA_KEY', 'clé-de-compte-de-service-inventée')
      expect(autogradeEnabled()).toBe(true)
      vi.stubEnv('AUTOGRADE_RUNNER_URL', '')
      expect(autogradeEnabled()).toBe(false) // ni service ni Chromium local
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('sur Vercel : désactivée sans secret de relance (AUTOGRADE_RELAUNCH_SECRET, 32 caractères au moins)', async () => {
    process.env.AUTOGRADE_ENABLED = '1'
    vi.stubEnv('AUTOGRADE_AU_BUILD', '0')
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', 'https://service.invalid')
    vi.stubEnv('AUTOGRADE_RUNNER_SA_KEY', 'clé-de-compte-de-service-inventée')
    try {
      const { autogradeEnabled } = await import('@/lib/autograde/enabled')
      vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', '')
      expect(autogradeEnabled()).toBe(false)
      vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', 'trop-court')
      expect(autogradeEnabled()).toBe(false)
      vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', 'secret-de-relance-invente-0123456789abcdef')
      expect(autogradeEnabled()).toBe(true)
      vi.stubEnv('VERCEL', '')
      vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', '')
      expect(autogradeEnabled()).toBe(true) // hors Vercel : relance facultative
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
    expect(scheduleDrain).not.toHaveBeenCalled()
  })
})
