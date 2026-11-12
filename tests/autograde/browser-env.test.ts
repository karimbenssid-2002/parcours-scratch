import { afterEach, describe, expect, it, vi } from 'vitest'

const launch = vi.fn<(opts: { env?: Record<string, string> }) => Promise<unknown>>(async () => ({ on: () => {}, newContext: async () => { throw new Error('pas de navigateur dans ce test') }, close: async () => {} }))
vi.mock('playwright-core', () => ({ chromium: { launch } }))

const SECRET = 'secret-de-test-inventé-0123456789abcdef'

afterEach(async () => {
  vi.unstubAllEnvs()
  const store = globalThis as unknown as Record<string, unknown>
  delete store.__autogradeBrowser; delete store.__autogradeSpare; delete store.__autogradeMinimalEnv
  launch.mockClear()
})

describe('environnement de Chromium', () => {
  it('service d’exécution : Chromium ne reçoit aucun secret, seulement les variables utiles', async () => {
    vi.stubEnv('RUNNER_DEV_SECRET', SECRET)
    vi.stubEnv('AUTOGRADE_RUNNER_SA_KEY', SECRET)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-inventée')
    vi.stubEnv('DATABASE_URL', 'postgres://x:y@base.invalid/db')
    const { openRunnerPage, enableMinimalBrowserEnv } = await import('@/lib/autograde/runner/browser')
    enableMinimalBrowserEnv()
    await openRunnerPage().catch(() => {})
    expect(launch).toHaveBeenCalled()
    for (const [opts] of launch.mock.calls) {
      const env = opts.env!
      expect(env).toBeDefined()
      expect(JSON.stringify(env)).not.toContain(SECRET)
      expect(Object.keys(env)).not.toEqual(expect.arrayContaining(['RUNNER_DEV_SECRET', 'AUTOGRADE_RUNNER_SA_KEY']))
      expect(Object.keys(env).some((k) => /SECRET|KEY|DATABASE/i.test(k))).toBe(false)
      expect(Object.keys(env).some((k) => k.toUpperCase() === 'PATH')).toBe(true)
    }
  })

  it('site en local : environnement inchangé (celui du processus)', async () => {
    const { openRunnerPage } = await import('@/lib/autograde/runner/browser')
    await openRunnerPage().catch(() => {})
    expect(launch.mock.calls[0][0].env).toBeUndefined()
  })
})
