import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { EDITOR_CSP, OFFLINE_PAGE_CSP, PERMISSIONS_POLICY, STRICT_CSP } from '@/lib/security/headers'

type HeaderRule = { source: string; headers: { key: string; value: string }[] }
/** Toutes les CSP que Next pose sur une adresse (règles dont la source correspond, comparées comme le fait Next). */
const cspAt = (rules: HeaderRule[], path: string) => rules
  .filter((r) => getPathMatch(r.source, { strict: true, removeUnnamedParams: true })(path) !== false)
  .flatMap((r) => r.headers).filter((h) => h.key.toLowerCase() === 'content-security-policy').map((h) => h.value)

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
      { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    ]))
    // Aucune CSP ici : elle se cumulerait à celle du proxy (deux CSP sont appliquées toutes les deux) et bloquerait les
    // scripts à nonce des pages.
    expect(all?.headers.map((h) => h.key.toLowerCase())).not.toContain('content-security-policy')
  })

  it('CSP de l’éditeur Scratch sur ses fichiers, y compris ceux servis depuis la racine (workers compris)', async () => {
    const config = await loadConfig()
    const headers = await config.headers!()
    for (const path of ['/scratch-editor/editor.html', '/scratch-editor/chunks/540.dc378b43.js', '/chunks/540.dc378b43.js',
      '/static/assets/add-backdrop.3d71.svg', '/scratch-editor/static/assets/a.png']) {
      expect(cspAt(headers, path), path).toEqual([EDITOR_CSP])
    }
  })

  it('CSP propre à la page hors connexion ; service workers inchangés', async () => {
    const config = await loadConfig()
    const headers = await config.headers!()
    expect(cspAt(headers, '/hors-connexion.html')).toEqual([OFFLINE_PAGE_CSP])
    expect(cspAt(headers, '/sw.js')).toEqual(["default-src 'self'; script-src 'self'"])
    expect(cspAt(headers, '/sw-click.js')).toEqual(["default-src 'self'; script-src 'self'"])
  })

  it('CSP stricte par défaut sur les routes API, les icônes et les manifestes', async () => {
    const config = await loadConfig()
    const headers = await config.headers!()
    for (const path of ['/api/projets/abc', '/api/cron/veille', '/icons/icon-192.png', '/icons/prof-apple-touch-icon.png',
      '/favicon.ico', '/manifest.webmanifest', '/admin/manifest.webmanifest']) {
      expect(cspAt(headers, path), path).toEqual([STRICT_CSP])
    }
  })

  it('une seule CSP par réponse : aucune règle ne vise une adresse passée par le proxy, aucun fichier visé n’y passe', async () => {
    const config = await loadConfig()
    const headers = await config.headers!()
    const { config: proxyConfig } = await import('../proxy')
    const viaProxy = (path: string) => new RegExp(`^${proxyConfig.matcher[0]}$`).test(path)
    // Pages (ou 404 de pages) servies par le proxy, avec sa CSP à nonce : aucune CSP de next.config en plus.
    for (const path of ['/', '/admin', '/defis/abc', '/confidentialite', '/api', '/icons', '/icons/x', '/scratch-editor',
      '/scratch-editor/x', '/chunks/a', '/static/assets/x', '/admin/manifest', '/hors-connexion']) {
      expect(viaProxy(path), path).toBe(true)
      expect(cspAt(headers, path), path).toEqual([])
    }
    // Fichiers et routes API qui portent une CSP de next.config : jamais vus par le proxy.
    for (const path of ['/scratch-editor/editor.html', '/chunks/a.js', '/static/assets/a.svg', '/hors-connexion.html',
      '/sw.js', '/api/projets/abc', '/icons/icon-192.png', '/favicon.ico', '/manifest.webmanifest', '/admin/manifest.webmanifest']) {
      expect(viaProxy(path), path).toBe(false)
    }
  })

  it('build sans correction automatique : éditeur Scratch et Chromium hors des fichiers serveur, exécution locale refusée', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).toEqual(expect.arrayContaining([
      './public/scratch-editor/**/*', './node_modules/playwright-core/**/*', './node_modules/@electric-sql/pglite/**/*',
    ]))
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '0' })
  })

  it('build avec service d’exécution distant (AUTOGRADE_RUNNER_URL) : éditeur et Chromium hors des fichiers serveur', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '1')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', 'https://service.invalid')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).toEqual(expect.arrayContaining(['./public/scratch-editor/**/*', './node_modules/playwright-core/**/*']))
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '0' })
  })

  it('build sur Vercel sans service distant : jamais de Chromium local (boutons masqués)', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '1')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', '')
    vi.stubEnv('VERCEL', '1')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).toEqual(expect.arrayContaining(['./public/scratch-editor/**/*', './node_modules/playwright-core/**/*']))
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '0' })
  })

  it('build avec correction automatique (local) : éditeur et Chromium gardés', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '1')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', '')
    vi.stubEnv('VERCEL', '')
    const config = await loadConfig()
    expect(config.outputFileTracingExcludes!['/*']).not.toContain('./public/scratch-editor/**/*')
    expect(config.env).toEqual({ AUTOGRADE_AU_BUILD: '1' })
  })
})
