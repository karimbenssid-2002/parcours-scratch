import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { exportPKCS8, generateKeyPair, jwtVerify, SignJWT, type CryptoKey } from 'jose'
import { googleIdToken, GOOGLE_TOKEN_URL, limitConcurrency, remoteRun, RunnerError } from '@/lib/autograde/runner/remote'
import type { RunResult } from '@/lib/autograde/runner/types'

const TOKEN = 'jeton-google-inventé.abc.def'
const SERVICE_URL = 'https://correction-runner-invente.a.run.app'
const base = { answers: ['Zoé'], keys: [], durationMs: 3000 }
const bytes = new Uint8Array([1, 2, 3, 250])
const result: RunResult = { project: { targets: [] }, traces: [] }

const ok = () => new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
const status = (s: number, body = '') => new Response(body, { status: s })
type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>
const asFetch = (f: unknown) => f as typeof globalThis.fetch

function client(responses: (Response | Error)[]) {
  const fetch = vi.fn<FetchFn>(async () => {
    const next = responses.shift()
    if (!next) throw new Error('plus de réponse prévue')
    if (next instanceof Error) throw next
    return next
  })
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
  const token = Object.assign(vi.fn(async () => TOKEN), { invalidate: vi.fn() })
  return { fetch, sleep, token, run: remoteRun(SERVICE_URL, token, { fetch: asFetch(fetch), sleep, random: () => 0 }) }
}

async function caught(p: Promise<unknown>): Promise<RunnerError> {
  try { await p } catch (e) { return e as RunnerError }
  throw new Error('aucune erreur levée')
}

describe('client du service d’exécution', () => {
  it('envoie le projet en base64, les réglages et le jeton, et renvoie le RunResult', async () => {
    const { fetch, run } = client([ok()])
    expect(await run(bytes, base, [1])).toEqual(result)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${SERVICE_URL}/run`)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(String(init?.body))
    expect(Buffer.from(body.project, 'base64').equals(Buffer.from(bytes))).toBe(true)
    expect(body.base).toEqual(base)
    expect(body.seeds).toEqual([1])
  })

  it('adresse avec une barre finale : pas de double barre', async () => {
    const fetch = vi.fn(async () => ok())
    await remoteRun(`${SERVICE_URL}/`, async () => TOKEN, { fetch: asFetch(fetch) })(bytes, base)
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${SERVICE_URL}/run`)
  })

  it('503, 503 puis 200 : le résultat, en 3 appels, après des pauses de 2 s puis 5 s', async () => {
    const { fetch, sleep, run } = client([status(503), status(503), ok()])
    expect(await run(bytes, base)).toEqual(result)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 5000])
  })

  it('429 puis erreur réseau puis 200 : réessayé aussi', async () => {
    const { fetch, run } = client([status(429), new TypeError('fetch failed'), ok()])
    expect(await run(bytes, base)).toEqual(result)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('toujours occupé : 5 essais, pauses de 2, 5, 10 puis 20 s, puis RunnerError « indisponible »', async () => {
    const { fetch, sleep, run } = client([status(503), status(429), status(503), status(429), status(503)])
    const e = await caught(run(bytes, base))
    expect(e).toBeInstanceOf(RunnerError)
    expect(e.unavailable).toBe(true)
    expect(e.reachedService).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 5000, 10000, 20000])
  })

  it('la gigue allonge chaque pause de 20 % au plus (total sous 60 s)', async () => {
    const fetch = vi.fn<FetchFn>(async () => status(503))
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
    const run = remoteRun(SERVICE_URL, async () => TOKEN, { fetch: asFetch(fetch), sleep, random: () => 0.999 })
    await caught(run(bytes, base))
    const pauses = sleep.mock.calls.map((c) => c[0])
    expect(pauses).toHaveLength(4)
    pauses.forEach((p, i) => { expect(p).toBeGreaterThan([2000, 5000, 10000, 20000][i]); expect(p).toBeLessThanOrEqual([2000, 5000, 10000, 20000][i] * 1.2) })
    expect(pauses.reduce((a, b) => a + b, 0)).toBeLessThan(60_000)
  })

  it('échéance globale de 270 s : plus de nouvel essai si la pause la dépasse', async () => {
    let t = 0
    const fetch = vi.fn<FetchFn>(async () => { t += 269_000; return status(503) })
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
    const run = remoteRun(SERVICE_URL, async () => TOKEN, { fetch: asFetch(fetch), sleep, random: () => 0, now: () => t })
    const e = await caught(run(bytes, base))
    expect(e.unavailable).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it.each([401, 403, 400, 413, 500])('%i : RunnerError sans réessayer, sans le corps de la réponse', async (s) => {
    const { fetch, sleep, run, token } = client([status(s, `corps de réponse ${TOKEN}`)])
    const e = await caught(run(bytes, base))
    expect(e).toBeInstanceOf(RunnerError)
    expect(e.unavailable).toBe(false)
    expect(e.status).toBe(s)
    expect(e.reachedService).toBe(true)
    expect(e.message).not.toContain('corps de réponse')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    // Jeton refusé : oublié, un nouveau sera demandé à la prochaine correction.
    expect(token.invalidate).toHaveBeenCalledTimes(s === 401 || s === 403 ? 1 : 0)
  })

  it('le jeton n’apparaît dans aucun message d’erreur', async () => {
    const cases: (Response | Error)[][] = [
      [status(401, TOKEN)],
      [new Error(`connexion refusée ${TOKEN}`), new Error(TOKEN), new Error(TOKEN)],
      [new DOMException(`délai dépassé ${TOKEN}`, 'TimeoutError')],
      [new Response('pas du json', { status: 200 })],
      [new Response(JSON.stringify({ autre: TOKEN }), { status: 200 })],
    ]
    for (const responses of cases) {
      const e = await caught(client(responses).run(bytes, base))
      expect(e).toBeInstanceOf(RunnerError)
      expect(e.message).not.toContain(TOKEN)
      expect(String(e.stack)).not.toContain(TOKEN)
      expect(JSON.stringify(e)).not.toContain(TOKEN)
      expect(e.message).toMatch(/[a-zé]/)
    }
  })

  it('délai dépassé (290 s) : RunnerError sans réessayer', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    const { fetch, run } = client([new DOMException('délai', 'TimeoutError')])
    const e = await caught(run(bytes, base))
    expect(e).toBeInstanceOf(RunnerError)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(290_000)
    spy.mockRestore()
  })

  it('jeton impossible à obtenir : RunnerError générique, sans appel au service', async () => {
    const fetch = vi.fn()
    const e = await caught(remoteRun(SERVICE_URL, async () => { throw new Error(`détail ${TOKEN}`) }, { fetch: asFetch(fetch) })(bytes, base))
    expect(e).toBeInstanceOf(RunnerError)
    expect(e.message).not.toContain(TOKEN)
    expect(e.reachedService).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Jeton d'identité Google : clés RSA fabriquées à l'exécution (jamais écrites dans le dépôt), point d'échange simulé.

const EMAIL = 'parcours-runner-invoker@projet-invente.iam.gserviceaccount.com'
let publicKey: CryptoKey
let googleKey: CryptoKey
let saKey = ''

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  publicKey = pair.publicKey
  googleKey = (await generateKeyPair('RS256')).privateKey // « Google » signe les jetons d'identité
  const json = { type: 'service_account', client_email: EMAIL, private_key_id: 'cle-inventee-1', private_key: await exportPKCS8(pair.privateKey) }
  saKey = Buffer.from(JSON.stringify(json)).toString('base64')
})

const claimsOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as Record<string, unknown>

/** Point d'échange de Google simulé : vérifie la signature de l'assertion et renvoie un jeton qui expire à `exp()`. */
function tokenEndpoint(exp: () => number) {
  const assertions: { header: Record<string, unknown>; claims: Record<string, unknown> }[] = []
  const fetch = vi.fn<FetchFn>(async (url, init) => {
    expect(String(url)).toBe(GOOGLE_TOKEN_URL)
    expect(new Headers(init?.headers).get('content-type')).toBe('application/x-www-form-urlencoded')
    const form = new URLSearchParams(String(init?.body))
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const assertion = form.get('assertion')!
    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, { currentDate: new Date(Number(claimsOf(assertion).iat) * 1000) })
    assertions.push({ header: protectedHeader as Record<string, unknown>, claims: payload })
    const idToken = await new SignJWT({ aud: String(payload.target_audience) }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime(Math.floor(exp())).sign(googleKey)
    return Response.json({ id_token: idToken })
  })
  return { fetch, assertions }
}

describe('jeton d’identité Google (compte de service)', () => {
  it('assertion RS256 signée par la clé : iss/sub = compte, aud = point d’échange, target_audience = service, 1 h au plus', async () => {
    const clock = 1_800_000_000_000
    const { fetch, assertions } = tokenEndpoint(() => clock / 1000 + 3600)
    const token = googleIdToken(saKey, SERVICE_URL, { fetch: asFetch(fetch), now: () => clock })
    expect((await token()).split('.')).toHaveLength(3)
    const [{ header, claims }] = assertions
    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT', kid: 'cle-inventee-1' })
    expect(claims).toMatchObject({ iss: EMAIL, sub: EMAIL, aud: GOOGLE_TOKEN_URL, target_audience: SERVICE_URL, iat: clock / 1000 })
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(3600)
    expect(claims).not.toHaveProperty('scope')
  })

  it('gardé en mémoire, puis renouvelé 5 minutes avant son expiration ; un seul échange pour des demandes simultanées', async () => {
    let clock = 1_800_000_000_000
    const { fetch } = tokenEndpoint(() => clock / 1000 + 3600)
    const token = googleIdToken(saKey, SERVICE_URL, { fetch: asFetch(fetch), now: () => clock })
    const first = await token()
    clock += 54 * 60_000 // 6 min avant l'expiration : même jeton
    expect(await token()).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
    clock += 2 * 60_000 // 4 min avant : nouveau jeton
    expect(await token()).not.toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)
    token.invalidate()
    await Promise.all([token(), token(), token()])
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('échange refusé, clé illisible ou point injoignable : RunnerError générique, sans la clé', async () => {
    const leak = saKey.slice(0, 24)
    const refused = vi.fn(async () => new Response(`{"error":"invalid_grant","detail":"${leak}"}`, { status: 400 }))
    const e1 = await caught(googleIdToken(saKey, SERVICE_URL, { fetch: asFetch(refused) })())
    expect(e1).toBeInstanceOf(RunnerError)
    expect(e1.status).toBe(400)
    const e2 = await caught(googleIdToken('pas une clé', SERVICE_URL, { fetch: asFetch(refused) })())
    expect(e2).toBeInstanceOf(RunnerError)
    const down = vi.fn(async () => { throw new TypeError(`fetch failed ${leak}`) })
    const e3 = await caught(googleIdToken(saKey, SERVICE_URL, { fetch: asFetch(down) })())
    expect(e3.unavailable).toBe(true)
    for (const e of [e1, e2, e3]) {
      expect(`${e.message} ${e.stack} ${JSON.stringify(e)}`).not.toContain(leak)
      expect(e.message).not.toContain('PRIVATE KEY')
    }
  })

  it('401 du service avec un jeton Google : RunnerError sans nouvel essai, jeton redemandé ensuite', async () => {
    const { fetch: tokenFetch } = tokenEndpoint(() => Date.now() / 1000 + 3600)
    const token = googleIdToken(saKey, SERVICE_URL, { fetch: asFetch(tokenFetch) })
    const service = vi.fn(async () => status(401))
    const run = remoteRun(SERVICE_URL, token, { fetch: asFetch(service), sleep: async () => {} })
    const e = await caught(run(bytes, base))
    expect(e).toBeInstanceOf(RunnerError)
    expect(e.status).toBe(401)
    expect(service).toHaveBeenCalledTimes(1)
    await caught(run(bytes, base))
    expect(tokenFetch).toHaveBeenCalledTimes(2) // le jeton refusé n'est pas réutilisé
  })
})

describe('dépendances réelles', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('avec AUTOGRADE_RUNNER_URL : jeton Google (audience = service) puis exécution par le service distant', async () => {
    vi.stubEnv('AUTOGRADE_RUNNER_URL', `${SERVICE_URL}/`)
    vi.stubEnv('AUTOGRADE_RUNNER_SA_KEY', saKey)
    const { fetch: tokenFetch, assertions } = tokenEndpoint(() => Date.now() / 1000 + 3600)
    const fetch = vi.fn<FetchFn>(async (url, init) => (String(url) === GOOGLE_TOKEN_URL ? tokenFetch(url, init) : ok()))
    vi.stubGlobal('fetch', fetch)
    const { liveDeps } = await import('@/lib/autograde/deps')
    const { runMany } = await import('@/lib/autograde/runner/run')
    const deps = liveDeps()
    expect(deps.run).not.toBe(runMany)
    expect(await deps.run(bytes, base)).toEqual(result)
    expect(assertions[0].claims.target_audience).toBe(SERVICE_URL)
    const call = fetch.mock.calls.find((c) => String(c[0]) === `${SERVICE_URL}/run`)!
    expect(new Headers(call[1]?.headers).get('authorization')).toMatch(/^Bearer ey/)
  })

  it('sans AUTOGRADE_RUNNER_URL : Chromium local', async () => {
    vi.stubEnv('AUTOGRADE_RUNNER_URL', '')
    const { liveDeps } = await import('@/lib/autograde/deps')
    const { runMany } = await import('@/lib/autograde/runner/run')
    expect(liveDeps().run).toBe(runMany)
  })
})

describe('limite d’appels distants simultanés', () => {
  it('25 appels en même temps : au plus 10 en cours, tous terminés, résultats dans le bon ordre', async () => {
    let now = 0, max = 0
    const inner = async (bytes: Uint8Array): Promise<RunResult> => {
      now++; max = Math.max(max, now)
      await new Promise((r) => setTimeout(r, 10))
      now--
      return { project: { n: bytes[0] }, traces: [] }
    }
    const run = limitConcurrency(inner, 10)
    const out = await Promise.all(Array.from({ length: 25 }, (_, i) => run(new Uint8Array([i]), base)))
    expect(max).toBe(10)
    expect(out.map((r) => (r.project as { n: number }).n)).toEqual(Array.from({ length: 25 }, (_, i) => i))
  })

  it('un appel qui échoue libère sa place', async () => {
    let calls = 0
    const run = limitConcurrency(async () => { if (calls++ === 0) throw new Error('boum'); return result }, 1)
    await expect(run(bytes, base)).rejects.toThrow('boum')
    expect(await run(bytes, base)).toEqual(result)
  })
})
