import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `after()` de Next : le travail est gardé pour être lancé à la main, après la réponse.
const ctx = vi.hoisted(() => ({
  pending: [] as (() => Promise<unknown> | unknown)[],
  drain: null as unknown as ReturnType<typeof vi.fn>,
  recover: null as unknown as ReturnType<typeof vi.fn>,
  needs: null as unknown as ReturnType<typeof vi.fn>,
}))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: (fn: () => unknown) => { ctx.pending.push(fn) } }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ({ fausse: 'base' }) }))
vi.mock('@/lib/autograde/deps', () => ({ liveDeps: () => ({ fausses: 'dépendances' }) }))
vi.mock('@/lib/autograde/queue', () => {
  ctx.drain = vi.fn(async () => ({ handled: 0, remaining: 0 }))
  ctx.recover = vi.fn(async () => 0)
  ctx.needs = vi.fn(async () => false)
  return { drainQueue: ctx.drain, recoverStuck: ctx.recover, needsDrain: ctx.needs }
})

const { POST, maxDuration } = await import('@/app/api/correction/continuer/route')
const launch = await import('@/lib/autograde/launch')

const SECRET = 'secret-de-relance-invente-0123456789abcdef'
const req = (authorization?: string, headers: Record<string, string> = {}) =>
  new Request('https://site.exemple.invalid/api/correction/continuer', { method: 'POST', headers: { ...(authorization ? { authorization } : {}), ...headers } })
const runAfter = async () => { for (const fn of ctx.pending.splice(0)) await fn() }
type Opts = { deadline: number; relaunch: () => Promise<boolean> }
const lastOpts = () => ctx.drain.mock.calls.at(-1)![2] as Opts

beforeEach(() => {
  ctx.pending.length = 0; ctx.drain.mockClear(); ctx.recover.mockClear(); ctx.needs.mockClear()
  // Hors de Vercel, en développement : l'origine peut venir de la requête.
  vi.stubEnv('VERCEL', ''); vi.stubEnv('AUTOGRADE_SITE_URL', ''); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('POST /api/correction/continuer (relance de la file)', () => {
  it('404 si la correction automatique est désactivée', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '')
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    expect((await POST(req(`Bearer ${SECRET}`))).status).toBe(404)
    expect(ctx.pending).toHaveLength(0)
  })

  it('401 sans secret, avec un mauvais secret, ou si le site n’a pas de secret de relance', async () => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req('Bearer mauvais'))).status).toBe(401)
    expect((await POST(req(SECRET))).status).toBe(401)
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', '')
    expect((await POST(req('Bearer '))).status).toBe(401)
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', 'trop-court')
    expect((await POST(req('Bearer trop-court'))).status).toBe(401)
    expect(ctx.pending).toHaveLength(0)
  })

  it('202 tout de suite, puis vide la file après la réponse ; prises arrêtées 150 s après le début de l’appel', async () => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    const fetch = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    const started = Date.now()
    const res = await POST(req(`Bearer ${SECRET}`, { 'x-forwarded-host': 'localhost:3000' }))
    expect(res.status).toBe(202)
    expect(ctx.drain).not.toHaveBeenCalled() // rien avant la réponse
    await new Promise((r) => setTimeout(r, 30)) // le travail commence plus tard : l'échéance part du début de l'appel
    await runAfter()
    expect(ctx.drain).toHaveBeenCalledTimes(1)
    expect(lastOpts().deadline).toBeGreaterThanOrEqual(started + 150_000)
    expect(lastOpts().deadline).toBeLessThan(started + 150_000 + 25)
    // En développement, l'origine vient de la requête ; réussie seulement sur une réponse 2xx.
    expect(await lastOpts().relaunch()).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/api/correction/continuer')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SECRET}`)
  })

  it('durée maximale de la fonction : 300 s', () => {
    expect(maxDuration).toBe(300)
  })
})

describe('adresse de la relance (le secret ne part que vers le site lui-même)', () => {
  const relaunchWith = async (headers: Record<string, string>) => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    const fetch = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    launch.scheduleDrain(Date.now(), new Headers(headers))
    await runAfter()
    const ok = await lastOpts().relaunch()
    return { fetch, warn, ok }
  }

  it('sur Vercel, un en-tête Host falsifié est ignoré : relance vers le domaine de production', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'scratch.exemple.invalid')
    const { fetch } = await relaunchWith({ host: 'pirate.invalid', 'x-forwarded-host': 'pirate.invalid', 'x-forwarded-proto': 'https' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://scratch.exemple.invalid/api/correction/continuer')
  })

  it('AUTOGRADE_SITE_URL a la priorité', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'projet.exemple.invalid')
    vi.stubEnv('AUTOGRADE_SITE_URL', 'https://scratch.exemple.invalid')
    const { fetch } = await relaunchWith({ 'x-forwarded-host': 'pirate.invalid' })
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://scratch.exemple.invalid/api/correction/continuer')
  })

  it('AUTOGRADE_SITE_URL invalide (http, chemin, paramètres) : aucune relance, un avertissement', async () => {
    for (const bad of ['http://scratch.exemple.invalid', 'https://scratch.exemple.invalid/autre', 'https://scratch.exemple.invalid/?x=1', 'pas une adresse']) {
      vi.stubEnv('AUTOGRADE_SITE_URL', bad)
      const { fetch, warn } = await relaunchWith({ 'x-forwarded-host': 'localhost:3000' })
      expect(fetch).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
      vi.restoreAllMocks()
    }
  })

  it('en production sans adresse configurée (hors Vercel) : jamais de secret envoyé d’après la requête', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { fetch, warn, ok } = await relaunchWith({ host: 'pirate.invalid', 'x-forwarded-host': 'pirate.invalid' })
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(ok).toBe(false) // relance ratée : la file le sait
  })

  it('sur Vercel sans domaine de production ni AUTOGRADE_SITE_URL : aucune relance', async () => {
    vi.stubEnv('VERCEL', '1')
    const { fetch } = await relaunchWith({ 'x-forwarded-host': 'pirate.invalid' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('relance sans secret configuré', () => {
  it('la file est quand même vidée dans la fonction en cours ; la relance est seulement journalisée, sans appel', async () => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', '')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    launch.scheduleDrain(Date.now(), new Headers({ 'x-forwarded-host': 'localhost:3000' }))
    await runAfter()
    expect(ctx.drain).toHaveBeenCalledTimes(1)
    expect(await lastOpts().relaunch()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('AUTOGRADE_RELAUNCH_SECRET')
  })

  it('une relance qui échoue est journalisée sans le secret, et n’interrompt rien', async () => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`refusé ${SECRET}`) }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    launch.scheduleDrain(Date.now(), new Headers({ 'x-forwarded-host': 'localhost:3000' }))
    await runAfter()
    await expect(lastOpts().relaunch()).resolves.toBe(false)
    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain(SECRET)
  })
})

describe('relance refusée par la route', () => {
  it('réponse non 2xx : relance comptée comme ratée', async () => {
    vi.stubEnv('AUTOGRADE_RELAUNCH_SECRET', SECRET)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    launch.scheduleDrain(Date.now(), new Headers({ 'x-forwarded-host': 'localhost:3000' }))
    await runAfter()
    expect(await lastOpts().relaunch()).toBe(false)
  })
})

describe('filet de sécurité du suivi de l’état (interrogé chaque seconde)', () => {
  it('reprise des copies bloquées au plus une fois toutes les 30 s ; file relancée seulement si nécessaire', async () => {
    launch.resetSafetyNetForTests()
    const db = { fausse: 'base' } as never
    const t0 = Date.now()
    await launch.pollSafetyNet(db, new Date(t0), t0, null)
    await launch.pollSafetyNet(db, new Date(t0 + 1_000), t0 + 1_000, null)
    await launch.pollSafetyNet(db, new Date(t0 + 29_000), t0 + 29_000, null)
    expect(ctx.recover).toHaveBeenCalledTimes(1)
    await launch.pollSafetyNet(db, new Date(t0 + 31_000), t0 + 31_000, null)
    expect(ctx.recover).toHaveBeenCalledTimes(2)
    expect(ctx.pending).toHaveLength(0) // needsDrain faux : rien lancé
    ctx.needs.mockResolvedValueOnce(true)
    await launch.pollSafetyNet(db, new Date(t0 + 32_000), t0 + 32_000, null)
    expect(ctx.pending).toHaveLength(1)
  })

  it('copie bloquée remise en file : la file est relancée, même si une autre fonction semble au travail', async () => {
    launch.resetSafetyNetForTests()
    ctx.recover.mockResolvedValueOnce(1)
    ctx.needs.mockResolvedValue(false)
    await launch.pollSafetyNet({ fausse: 'base' } as never, new Date(), Date.now(), null)
    expect(ctx.pending).toHaveLength(1)
  })
})
