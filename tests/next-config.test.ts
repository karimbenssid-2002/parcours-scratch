import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  return (await import('../next.config')).default
}

afterEach(() => vi.unstubAllEnvs())

describe('next.config', () => {
  it('en-têtes de sécurité sur toutes les routes', async () => {
    const config = await loadConfig()
    const all = (await config.headers!()).find((h) => h.source === '/:path*')
    expect(all?.headers).toEqual(expect.arrayContaining([
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ]))
  })

  it('build sans correction automatique : éditeur Scratch et Chromium hors des fichiers serveur, instrumentation allégée', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).toEqual(expect.arrayContaining([
      './public/scratch-editor/**/*', './node_modules/playwright-core/**/*', './node_modules/@electric-sql/pglite/**/*',
    ]))
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '0' })
  })

  it('build avec correction automatique (local) : éditeur et Chromium gardés', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '1')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).not.toContain('./public/scratch-editor/**/*')
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '1' })
  })
})
