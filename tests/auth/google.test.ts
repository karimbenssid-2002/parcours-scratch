import { createLocalJWKSet, errors, exportJWK, generateKeyPair, SignJWT, base64url, type CryptoKey, type JWTVerifyGetKey } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishGoogleLogin, GoogleLoginError, openPending, sealPending, startGoogleLogin, type PendingLogin } from '@/lib/auth/google'
import { signAdmin, verifyAdmin } from '@/lib/auth/jwt'

const CLIENT_ID = 'client-test.apps.googleusercontent.com'
const CLIENT_SECRET = 'secret-google-de-test-ne-pas-afficher'
const REDIRECT = 'http://localhost:3000/auth/google/callback'
const CODE = 'code-autorisation-de-test'

const pending: PendingLogin = { kind: 'eleve', state: 'etat-test', nonce: 'nonce-test', verifier: 'v'.repeat(43) }

let googleKey: CryptoKey
let otherKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const google = await generateKeyPair('RS256', { extractable: true })
  const other = await generateKeyPair('RS256', { extractable: true })
  googleKey = google.privateKey
  otherKey = other.privateKey
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: 'cle-google', alg: 'RS256', use: 'sig' }] })
})

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('GOOGLE_CLIENT_SECRET', CLIENT_SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

type Claims = Record<string, unknown>
const baseClaims: Claims = {
  email: 'alice.exemple@malraux-rabat.org', email_verified: true, hd: 'malraux-rabat.org', nonce: 'nonce-test', sub: '1234567890',
}

async function idToken(opts: { claims?: Claims; iss?: string; aud?: string | string[]; key?: CryptoKey; exp?: number; iat?: number } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ ...baseClaims, ...opts.claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'cle-google' })
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? CLIENT_ID)
    .setIssuedAt(opts.iat ?? (opts.exp ? opts.exp - 3600 : now))
    .setExpirationTime(opts.exp ?? now + 3600)
    .sign(opts.key ?? googleKey)
}

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

describe('finishGoogleLogin', () => {
  it("échange le code et rend l'identité du jeton vérifié", async () => {
    const f = fakeFetch({ id_token: await idToken(), access_token: 'jeton-acces' })
    expect(await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks }))
      .toEqual({ email: 'alice.exemple@malraux-rabat.org', emailVerified: true, hd: 'malraux-rabat.org' })

    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe('https://oauth2.googleapis.com/token')
    expect(init?.method).toBe('POST')
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code', code: CODE, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT, code_verifier: pending.verifier,
    })
  })

  it('accepte aussi l\'émetteur « accounts.google.com »', async () => {
    const f = fakeFetch({ id_token: await idToken({ iss: 'accounts.google.com' }) })
    expect((await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).email).toBe('alice.exemple@malraux-rabat.org')
  })

  it('hd absent → null ; email_verified autre que true → false', async () => {
    const f = fakeFetch({ id_token: await idToken({ claims: { hd: undefined, email: 'alice.exemple@gmail.com', email_verified: 'true' } }) })
    expect(await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks }))
      .toEqual({ email: 'alice.exemple@gmail.com', emailVerified: false, hd: null })
  })

  const refus: [string, () => Promise<string>][] = [
    ['mauvais aud', () => idToken({ aud: 'autre-client.apps.googleusercontent.com' })],
    ['mauvais iss', () => idToken({ iss: 'https://faux-google.example' })],
    ['mauvais nonce', () => idToken({ claims: { nonce: 'autre-nonce' } })],
    ['nonce absent', () => idToken({ claims: { nonce: undefined } })],
    ['expiré', () => idToken({ exp: Math.floor(Date.now() / 1000) - 600 })],
    ['signé par une autre clé', () => idToken({ key: otherKey })],
    ['sans adresse', () => idToken({ claims: { email: undefined } })],
    ['aud multiple (même avec notre identifiant)', () => idToken({ aud: [CLIENT_ID, 'autre-client.apps.googleusercontent.com'] })],
    ['azp différent de notre identifiant', () => idToken({ claims: { azp: 'autre-client.apps.googleusercontent.com' } })],
    ['expiré depuis plus de 30 s', () => idToken({ exp: Math.floor(Date.now() / 1000) - 60 })],
  ]
  it.each(refus)('refuse un jeton : %s', async (_nom, make) => {
    const f = fakeFetch({ id_token: await make() })
    await expect(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).rejects.toThrow()
  })

  it('accepte un azp égal à notre identifiant', async () => {
    const f = fakeFetch({ id_token: await idToken({ claims: { azp: CLIENT_ID } }) })
    expect((await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).email).toBe('alice.exemple@malraux-rabat.org')
  })

  it("tolère 30 s d'écart d'horloge (jeton expiré depuis 20 s, émis 20 s « dans le futur »)", async () => {
    const now = Math.floor(Date.now() / 1000)
    for (const token of [await idToken({ exp: now - 20 }), await idToken({ iat: now + 20, exp: now + 3600 })]) {
      const f = fakeFetch({ id_token: token })
      expect((await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).email).toBe('alice.exemple@malraux-rabat.org')
    }
  })

  it("l'appel au point de jeton a un délai maximal ; un abandon donne l'erreur générique", async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const f = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    await expect(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).rejects.toThrow('La connexion Google a échoué.')
    expect(f).toHaveBeenCalledOnce()
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(f.mock.calls[0][1]?.signal).toBe(timeout.mock.results[0].value)
    timeout.mockRestore()
  })

  it('refuse une réponse sans id_token ou en erreur, sans divulguer code ni secret', async () => {
    for (const f of [fakeFetch({ access_token: 'x' }), fakeFetch({ error: 'invalid_grant', error_description: CODE }, 400)]) {
      const err = await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      const msg = (err as Error).message
      expect(msg).not.toContain(CODE)
      expect(msg).not.toContain(CLIENT_SECRET)
      expect(msg).not.toContain('invalid_grant')
    }
  })

  it("le message d'erreur d'un jeton refusé ne contient pas le jeton", async () => {
    const token = await idToken({ aud: 'autre' })
    const err = await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: token }), jwks }).catch((e: unknown) => e)
    expect((err as Error).message).not.toContain(token.split('.')[1])
    expect((err as Error).message).not.toContain('autre')
  })

  // Le message reste générique ; `detail` sert au journal du retour de Google : court, sans adresse, code, secret ni jeton.
  const detailOf = async (p: Promise<unknown>) => {
    const err = await p.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GoogleLoginError)
    expect((err as Error).message).toBe('La connexion Google a échoué.')
    const detail = (err as GoogleLoginError).detail
    for (const secret of [CODE, CLIENT_SECRET, 'alice.exemple', '@', 'description-a-ne-pas-journaliser']) expect(detail).not.toContain(secret)
    return detail
  }

  it.each([
    [400, 'invalid_grant'], [401, 'invalid_client'], [400, 'redirect_uri_mismatch'],
  ])('point de jeton HTTP %i %s : détail = statut et champ error seuls', async (status, error) => {
    const f = fakeFetch({ error, error_description: `description-a-ne-pas-journaliser ${CODE} alice.exemple@malraux-rabat.org` }, status)
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks }))).toBe(`point de jeton : HTTP ${status}, ${error}`)
  })

  it("point de jeton : champ error étrange ou absent → statut seul", async () => {
    for (const body of [{ error: 'alice.exemple@malraux-rabat.org <script>' }, { autre: 1 }, 'pas du json']) {
      const f = vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 500 }))
      expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks }))).toBe('point de jeton : HTTP 500')
    }
  })

  it('point de jeton injoignable ou réponse sans id_token', async () => {
    const down = vi.fn<typeof fetch>(async () => { throw new DOMException('timeout', 'TimeoutError') })
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: down, jwks }))).toBe('point de jeton injoignable (TimeoutError)')
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ access_token: 'x' }), jwks })))
      .toBe('point de jeton : réponse sans id_token')
  })

  it("jeton refusé par jose : son code (et la revendication en cause), jamais le jeton", async () => {
    const aud = await idToken({ aud: 'autre-client.apps.googleusercontent.com' })
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: aud }), jwks })))
      .toBe("jeton d'identité refusé : ERR_JWT_CLAIM_VALIDATION_FAILED (aud)")
    const exp = await idToken({ exp: Math.floor(Date.now() / 1000) - 600 })
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: exp }), jwks })))
      .toBe("jeton d'identité refusé : ERR_JWT_EXPIRED (exp)")
    const sig = await idToken({ key: otherKey })
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: sig }), jwks })))
      .toBe("jeton d'identité refusé : ERR_JWS_SIGNATURE_VERIFICATION_FAILED")
    const nonce = await idToken({ claims: { nonce: 'autre' } })
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: nonce }), jwks })))
      .toBe("jeton d'identité refusé : nonce")
  })

  it('clés de Google injoignables : détail du code jose', async () => {
    const down: JWTVerifyGetKey = async () => { throw new errors.JWKSTimeout() }
    expect(await detailOf(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({ id_token: await idToken() }), jwks: down })))
      .toBe("jeton d'identité refusé : ERR_JWKS_TIMEOUT")
  })

  it('non configurée : détail « non configurée » et nom de la variable', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    const err = await finishGoogleLogin(CODE, pending, REDIRECT, { fetch: fakeFetch({}), jwks }).catch((e: unknown) => e)
    expect((err as GoogleLoginError).detail).toBe('non configurée (GOOGLE_CLIENT_SECRET absent)')
  })

  it('refuse si la connexion Google n\'est pas configurée', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    const f = fakeFetch({ id_token: await idToken() })
    await expect(finishGoogleLogin(CODE, pending, REDIRECT, { fetch: f, jwks })).rejects.toThrow()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('startGoogleLogin', () => {
  it("construit l'URL d'autorisation élève (PKCE, state, nonce, hd du collège)", async () => {
    const { url, pending: p } = await startGoogleLogin('eleve', REDIRECT)
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const q = u.searchParams
    expect(q.get('client_id')).toBe(CLIENT_ID)
    expect(q.get('redirect_uri')).toBe(REDIRECT)
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe('openid email')
    expect(q.get('prompt')).toBe('select_account')
    expect(q.get('hd')).toBe('malraux-rabat.org')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('state')).toBe(p.state)
    expect(q.get('nonce')).toBe(p.nonce)
    expect(p.kind).toBe('eleve')
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.verifier)))
    expect(q.get('code_challenge')).toBe(base64url.encode(digest))
    expect(url).not.toContain(CLIENT_SECRET)
    expect(url).not.toContain(p.verifier)
  })

  it("enseignant : hd=* ; valeurs aléatoires différentes à chaque départ", async () => {
    const a = await startGoogleLogin('enseignant', REDIRECT)
    const b = await startGoogleLogin('enseignant', REDIRECT)
    expect(new URL(a.url).searchParams.get('hd')).toBe('*')
    expect(a.pending.kind).toBe('enseignant')
    expect(a.pending.state).not.toBe(b.pending.state)
    expect(a.pending.nonce).not.toBe(b.pending.nonce)
    expect(a.pending.verifier).not.toBe(b.pending.verifier)
    expect(a.pending.state.length).toBeGreaterThanOrEqual(32)
  })

  it("refuse sans GOOGLE_CLIENT_ID", async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    await expect(startGoogleLogin('eleve', REDIRECT)).rejects.toThrow()
  })
})

describe('sealPending / openPending', () => {
  it('rend la connexion en cours scellée', async () => {
    expect(await openPending(await sealPending(pending))).toEqual(pending)
  })

  it('rend null pour un jeton altéré ou quelconque', async () => {
    const token = await sealPending(pending)
    expect(await openPending(token.slice(0, -2) + 'xx')).toBeNull()
    expect(await openPending('nimporte-quoi')).toBeNull()
    expect(await openPending('')).toBeNull()
  })

  it('rend null au-delà de 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const token = await sealPending(pending)
    vi.setSystemTime(Date.now() + 9 * 60_000)
    expect(await openPending(token)).toEqual(pending)
    vi.setSystemTime(Date.now() + 2 * 60_000)
    expect(await openPending(token)).toBeNull()
  })

  it("n'est jamais confondu avec une session (et inversement)", async () => {
    expect(await verifyAdmin(await sealPending(pending))).toBeNull()
    expect(await openPending(await signAdmin({ teacherId: 't1', username: 'bob.modele', role: 'prof' })))
      .toBeNull()
  })
})
