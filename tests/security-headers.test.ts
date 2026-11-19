import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { EDITOR_CSP, OFFLINE_PAGE_CSP, PERMISSIONS_POLICY, STRICT_CSP, newNonce, siteCsp } from '@/lib/security/headers'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d === name || d.startsWith(`${name} `))

afterEach(() => vi.unstubAllEnvs())

describe('CSP des pages du site', () => {
  it('scripts autorisés par le nonce seul, sans unsafe-inline ni unsafe-eval en production', () => {
    const csp = siteCsp('abc', { dev: false })
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(directive(csp, 'frame-src')).toBe('frame-src \'self\' https://www.youtube-nocookie.com')
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https://i.ytimg.com")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'")
    expect(directive(csp, 'upgrade-insecure-requests')).toBe('upgrade-insecure-requests')
  })

  it('liste exacte de la spec, sans Supabase en local', () => {
    expect(siteCsp('n0nce', { dev: false })).toBe([
      "default-src 'self'",
      "script-src 'self' 'nonce-n0nce' 'strict-dynamic'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://i.ytimg.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self' https://www.youtube-nocookie.com",
      "worker-src 'self'",
      "manifest-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      'upgrade-insecure-requests',
    ].join('; '))
  })

  it('en développement : unsafe-eval ajouté aux scripts (exigé par React en dev)', () => {
    expect(directive(siteCsp('abc', { dev: true }), 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'")
  })

  it('en développement : pas de upgrade-insecure-requests (next dev ouvert en http depuis un téléphone du réseau local)', () => {
    expect(directive(siteCsp('abc', { dev: true }), 'upgrade-insecure-requests')).toBeUndefined()
    expect(directive(siteCsp('abc', { dev: false }), 'upgrade-insecure-requests')).toBe('upgrade-insecure-requests')
  })

  it('stockage Supabase : son origine seule ajoutée aux connexions (envoi des gros projets par URL signée)', () => {
    const csp = siteCsp('abc', { dev: false, supabaseUrl: 'https://xyz.supabase.co/' })
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://xyz.supabase.co")
    expect(directive(siteCsp('abc', { dev: false, supabaseUrl: 'https://xyz.supabase.co/storage/v1' }), 'connect-src'))
      .toBe("connect-src 'self' https://xyz.supabase.co")
    expect(directive(siteCsp('abc', { dev: false, supabaseUrl: 'pas une adresse' }), 'connect-src')).toBe("connect-src 'self'")
  })
})

describe('nonce', () => {
  it('neuf à chaque appel, en base64', () => {
    const a = newNonce()
    const b = newNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(a.length).toBeGreaterThanOrEqual(24)
  })
})

describe('autres en-têtes', () => {
  it('Permissions-Policy : caméra et micro pour le site seul, le reste coupé', () => {
    expect(PERMISSIONS_POLICY).toContain('camera=(self)')
    expect(PERMISSIONS_POLICY).toContain('microphone=(self)')
    expect(PERMISSIONS_POLICY).toContain('geolocation=()')
    expect(PERMISSIONS_POLICY).toBe('camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), '
      + 'magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()')
  })

  it('éditeur Scratch : script en ligne et eval permis ; hors du site, seulement les bibliothèques, la traduction et la synthèse vocale', () => {
    expect(EDITOR_CSP).toBe([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      // Vignettes des bibliothèques (cdn.assets) ; fichiers des sprites, sons et arrière-plans lus par l'éditeur (assets).
      "img-src 'self' data: blob: https://cdn.assets.scratch.mit.edu https://assets.scratch.mit.edu",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' data: blob: https://cdn.assets.scratch.mit.edu https://assets.scratch.mit.edu "
        + 'https://translate-service.scratch.mit.edu https://synthesis-service.scratch.mit.edu',
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; '))
  })

  it('CSP stricte par défaut (routes API, icônes, manifestes)', () => {
    expect(STRICT_CSP).toBe("default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
  })

  it('page hors connexion : son script en ligne permis, rien hors du site', () => {
    expect(OFFLINE_PAGE_CSP).toBe("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
  })
})

describe('proxy : CSP à nonce', () => {
  const ORIGIN = 'https://scratch.example.test'
  const load = async () => { vi.resetModules(); return (await import('@/proxy')).proxy }
  const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1]

  it('page ouverte : même CSP sur la réponse et transmise à Next avec le nonce (x-nonce)', async () => {
    const proxy = await load()
    const res = await proxy(new NextRequest(new URL('/confidentialite', ORIGIN)))
    const csp = res.headers.get('content-security-policy')
    const nonce = nonceOf(csp)
    expect(nonce).toBeTruthy()
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp)
    expect(res.headers.get('x-middleware-override-headers')?.split(',')).toEqual(expect.arrayContaining(['x-nonce', 'content-security-policy']))
  })

  it('nonce neuf à chaque requête', async () => {
    const proxy = await load()
    const a = await proxy(new NextRequest(new URL('/confidentialite', ORIGIN)))
    const b = await proxy(new NextRequest(new URL('/confidentialite', ORIGIN)))
    expect(nonceOf(a.headers.get('content-security-policy'))).not.toBe(nonceOf(b.headers.get('content-security-policy')))
  })

  it('redirection : CSP posée aussi', async () => {
    const proxy = await load()
    const res = await proxy(new NextRequest(new URL('/admin', ORIGIN)))
    expect(res.headers.get('location')).toBeTruthy()
    expect(nonceOf(res.headers.get('content-security-policy'))).toBeTruthy()
  })

  it('stockage Supabase en ligne : son origine dans connect-src ; stockage local : non', async () => {
    vi.stubEnv('STORAGE_BACKEND', 'supabase')
    vi.stubEnv('SUPABASE_URL', 'https://xyz.supabase.co')
    let proxy = await load()
    let csp = (await proxy(new NextRequest(new URL('/confidentialite', ORIGIN)))).headers.get('content-security-policy')!
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://xyz.supabase.co")
    vi.stubEnv('STORAGE_BACKEND', '')
    proxy = await load()
    csp = (await proxy(new NextRequest(new URL('/confidentialite', ORIGIN)))).headers.get('content-security-policy')!
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
  })
})
