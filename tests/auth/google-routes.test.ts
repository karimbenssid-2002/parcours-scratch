import { NextRequest } from 'next/server'
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'
import type { GoogleIdentity, LoginKind } from '@/lib/auth/identity'

// Handlers appelés directement : base de test, et faux Google (finishGoogleLogin remplacé).
// `ctx.google` : vrai finishGoogleLogin, avec un faux point de jeton et de fausses clés (journal de bout en bout).
const ctx = vi.hoisted(() => ({
  db: null as unknown, identity: null as unknown, fail: false, dbFail: false, limitFail: false,
  google: null as null | { fetch: typeof fetch; jwks: unknown },
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))
vi.mock('@/lib/auth/google', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/google')>()
  return {
    ...real,
    finishGoogleLogin: vi.fn(async (...args: Parameters<typeof real.finishGoogleLogin>) => {
      if (ctx.google) return real.finishGoogleLogin(args[0], args[1], args[2], ctx.google as Parameters<typeof real.finishGoogleLogin>[3])
      if (ctx.fail) throw new real.GoogleLoginError('point de jeton : HTTP 400, invalid_grant')
      return ctx.identity
    }),
  }
})
vi.mock('@/lib/auth/limits', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/limits')>()
  return {
    ...real,
    isBlocked: vi.fn(async (...args: Parameters<typeof real.isBlocked>) => {
      if (ctx.limitFail) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
      return real.isBlocked(...args)
    }),
  }
})

vi.mock('@/lib/auth/google-login', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/google-login')>()
  return {
    ...real,
    studentGoogleLogin: vi.fn(async (...args: Parameters<typeof real.studentGoogleLogin>) => {
      // Comme Drizzle : le message cite la requête et ses paramètres (l'adresse) ; la cause est l'erreur du pilote.
      if (ctx.dbFail) throw new Error(`Failed query: select * from students where email = $1\nparams: ${args[1]}`, { cause: new Error('base indisponible') })
      return real.studentGoogleLogin(...args)
    }),
  }
})

const google = await import('@/lib/auth/google')
const { GET: start } = await import('@/app/auth/google/[kind]/route')
const { GET: callback } = await import('@/app/auth/google/callback/route')
const { POST: devLogin } = await import('@/app/auth/dev/route')
const { createTeacher } = await import('@/lib/db/teachers')
const { createClass, addEmailsToClass } = await import('@/lib/db/classes')
const { createStudent } = await import('@/lib/db/students')
const { createTeacherRequest } = await import('@/lib/db/teacher-requests')
const { isBlocked } = await import('@/lib/auth/limits')

const ORIGIN = 'http://localhost:3000'
let db: DB

beforeEach(async () => {
  db = await testDb()
  ctx.db = db
  ctx.identity = null
  ctx.fail = false
  ctx.dbFail = false
  ctx.limitFail = false
  ctx.google = null
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-test.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-google-de-test')
  vi.mocked(google.finishGoogleLogin).mockClear()
}, 30_000) // premier appel : démarrage de PGlite, lent quand tous les fichiers démarrent ensemble
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const params = (kind: string) => ({ params: Promise.resolve({ kind }) })
const setCookies = (res: Response) => res.headers.getSetCookie()
const cookieNamed = (res: Response, name: string) => setCookies(res).find((c) => c.startsWith(`${name}=`))
const location = (res: Response) => {
  const l = res.headers.get('location')
  return l === null ? null : new URL(l, ORIGIN).pathname + new URL(l, ORIGIN).search
}

/** Départ réel (cookie posé), puis retour de Google avec ce cookie et le `state` donné (celui du départ par défaut). */
async function roundTrip(kind: LoginKind, identity: GoogleIdentity | null, opts: { state?: string; cookie?: boolean; query?: string } = {}) {
  const res = await start(new NextRequest(`${ORIGIN}/auth/google/${kind}`), params(kind))
  const sealed = cookieNamed(res, 'google_login')!.split(';')[0].slice('google_login='.length)
  const state = new URL(res.headers.get('location')!).searchParams.get('state')!
  ctx.identity = identity
  const query = opts.query ?? `code=code-de-test&state=${encodeURIComponent(opts.state ?? state)}`
  const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.9' }
  if (opts.cookie !== false) headers.cookie = `google_login=${sealed}`
  return callback(new NextRequest(`${ORIGIN}/auth/google/callback?${query}`, { headers }))
}

const expectNoSession = (res: Response) => {
  expect(cookieNamed(res, 'student_session')).toBeUndefined()
  expect(cookieNamed(res, 'admin_session')).toBeUndefined()
}
const expectPendingCleared = (res: Response) => {
  const c = cookieNamed(res, 'google_login')
  expect(c).toBeDefined()
  expect(c).toMatch(/^google_login=;/)
  expect(c).toMatch(/Path=\/auth\/google/i)
  expect(c).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i)
}

const eleveId = (email: string): GoogleIdentity => ({ email, emailVerified: true, hd: 'malraux-rabat.org' })

async function enroll(email: string) {
  const owner = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const c = await createClass(db, owner.id, { name: '6e A', level: '6' })
  await addEmailsToClass(db, c.id, [email])
  return owner
}

describe('départ vers Google', () => {
  it('redirige vers Google et pose le cookie google_login', async () => {
    const res = await start(new NextRequest(`${ORIGIN}/auth/google/eleve`), params('eleve'))
    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/google/callback`)
    expect(url.searchParams.get('hd')).toBe('malraux-rabat.org')
    const c = cookieNamed(res, 'google_login')!
    expect(c).toMatch(/HttpOnly/i)
    expect(c).toMatch(/SameSite=Lax/i)
    expect(c).toMatch(/Path=\/auth\/google/i)
    expect(c).toMatch(/Max-Age=600/i)
    expect(c).not.toMatch(/Secure/i) // hors production
  })

  it('cookie Secure en production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await start(new NextRequest(`${ORIGIN}/auth/google/enseignant`), params('enseignant'))
    expect(cookieNamed(res, 'google_login')).toMatch(/Secure/i)
    expect(new URL(res.headers.get('location')!).searchParams.get('hd')).toBe('*')
  })

  it("adresse de retour bâtie sur l'origine de la requête (production)", async () => {
    const res = await start(new NextRequest('https://parcours-scratch.vercel.app/auth/google/eleve'), params('eleve'))
    expect(new URL(res.headers.get('location')!).searchParams.get('redirect_uri'))
      .toBe('https://parcours-scratch.vercel.app/auth/google/callback')
  })

  it('kind inconnu → 404', async () => {
    const res = await start(new NextRequest(`${ORIGIN}/auth/google/admin`), params('admin'))
    expect(res.status).toBe(404)
    expect(cookieNamed(res, 'google_login')).toBeUndefined()
  })

  it("sans GOOGLE_CLIENT_ID : retour à la page de connexion avec l'erreur générique", async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const res = await start(new NextRequest(`${ORIGIN}/auth/google/enseignant`), params('enseignant'))
    expect(location(res)).toBe('/admin/login?erreur=echec')
    expect(cookieNamed(res, 'google_login')).toBeUndefined()
  })
})

describe('retour de Google', () => {
  it('sans cookie → ?erreur=expire, aucune session', async () => {
    const res = await roundTrip('eleve', eleveId('alice.exemple@malraux-rabat.org'), { cookie: false })
    expect(location(res)).toBe('/connexion?erreur=expire')
    expectNoSession(res)
    expect(google.finishGoogleLogin).not.toHaveBeenCalled()
  })

  it('state différent → ?erreur=expire sur la page du rôle, aucune session', async () => {
    const res = await roundTrip('enseignant', { email: 'bob.modele@malraux-rabat.org', emailVerified: true, hd: 'malraux-rabat.org' }, { state: 'autre-etat' })
    expect(location(res)).toBe('/admin/login?erreur=expire')
    expectNoSession(res)
    expectPendingCleared(res)
    expect(google.finishGoogleLogin).not.toHaveBeenCalled()
  })

  it('élève inscrit → cookie student_session, puis espace élève', async () => {
    await enroll('alice.exemple@malraux-rabat.org')
    const res = await roundTrip('eleve', eleveId('Alice.Exemple@Malraux-Rabat.org'))
    expect(res.status).toBe(200)
    expect(cookieNamed(res, 'student_session')).toMatch(/HttpOnly/i)
    expect(cookieNamed(res, 'admin_session')).toBeUndefined()
    expectPendingCleared(res)
    // Page de relais : le cookie de session (SameSite=Strict) n'est envoyé qu'à une navigation partie du site.
    expect(await res.text()).toContain('url=/"')
    expect(vi.mocked(google.finishGoogleLogin).mock.calls[0][2]).toBe(`${ORIGIN}/auth/google/callback`)
  })

  it('élève absent des classes → ?erreur=non-inscrit', async () => {
    const res = await roundTrip('eleve', eleveId('alice.exemple@malraux-rabat.org'))
    expect(location(res)).toBe('/connexion?erreur=non-inscrit')
    expectNoSession(res)
    expectPendingCleared(res)
  })

  it('enseignant en attente → ?erreur=en-attente', async () => {
    await createTeacherRequest(db, 'chloe.essai@mlfmonde.org')
    const res = await roundTrip('enseignant', { email: 'chloe.essai@malraux-rabat.org', emailVerified: true, hd: 'malraux-rabat.org' })
    expect(location(res)).toBe('/admin/login?erreur=en-attente')
    expectNoSession(res)
    expectPendingCleared(res)
  })

  it('enseignant actif → cookie admin_session, puis tableau de bord', async () => {
    await createTeacher(db, { email: 'bob.modele@malraux-rabat.org', username: 'bob.modele', firstName: 'Bob', lastName: 'Modele', role: 'prof' })
    const res = await roundTrip('enseignant', { email: 'bob.modele@mlfmonde.org', emailVerified: true, hd: 'mlfmonde.org' })
    expect(res.status).toBe(200)
    expect(cookieNamed(res, 'admin_session')).toBeDefined()
    expect(cookieNamed(res, 'student_session')).toBeUndefined()
    expect(await res.text()).toContain('url=/admin"')
    expectPendingCleared(res)
  })

  it("un enseignant sur la page élève reste un élève (aucune session enseignant)", async () => {
    await createTeacher(db, { email: 'bob.modele@malraux-rabat.org', username: 'bob.modele', firstName: 'Bob', lastName: 'Modele', role: 'admin' })
    const res = await roundTrip('eleve', eleveId('bob.modele@malraux-rabat.org'))
    expect(location(res)).toBe('/connexion?erreur=non-inscrit')
    expectNoSession(res)
  })

  it("adresse hors domaine → ?erreur=domaine, journal sans l'adresse", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await roundTrip('enseignant', { email: 'bob.modele@gmail.com', emailVerified: true, hd: null })
    expect(location(res)).toBe('/admin/login?erreur=domaine')
    expectNoSession(res)
    expect(warn).toHaveBeenCalledOnce()
    const line = warn.mock.calls[0].join(' ')
    expect(line).toContain('aucun hd')
    expect(line).not.toContain('bob.modele')
    expect(line).not.toContain('@')
  })

  it("hd inattendu : journalisé (rôle et hd), jamais l'adresse", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await roundTrip('enseignant', { email: 'bob.modele@mlfmonde.org', emailVerified: true, hd: 'reseau-autre.org' })
    expect(location(res)).toBe('/admin/login?erreur=domaine')
    const line = warn.mock.calls[0].join(' ')
    expect(line).toContain('enseignant')
    expect(line).toContain('reseau-autre.org')
    expect(line).not.toContain('bob.modele')
  })

  it('adresse non vérifiée → ?erreur=non-verifiee', async () => {
    const res = await roundTrip('eleve', { email: 'alice.exemple@malraux-rabat.org', emailVerified: false, hd: 'malraux-rabat.org' })
    expect(location(res)).toBe('/connexion?erreur=non-verifiee')
    expectNoSession(res)
  })

  it('échec chez Google → ?erreur=echec, cookie effacé', async () => {
    ctx.fail = true
    const res = await roundTrip('eleve', null)
    expect(location(res)).toBe('/connexion?erreur=echec')
    expectNoSession(res)
    expectPendingCleared(res)
  })

  it('erreur de base après Google → ?erreur=echec (pas de 500), cookie effacé, aucune session', async () => {
    await enroll('alice.exemple@malraux-rabat.org')
    ctx.dbFail = true
    const res = await roundTrip('eleve', eleveId('alice.exemple@malraux-rabat.org'))
    expect(location(res)).toBe('/connexion?erreur=echec')
    expectNoSession(res)
    expectPendingCleared(res)
  })

  it("l'élève annule sur la page Google → page de connexion sans message", async () => {
    const res = await roundTrip('eleve', null, { query: 'error=access_denied&state=x' })
    expect(location(res)).toBe('/connexion')
    expectPendingCleared(res)
    expect(google.finishGoogleLogin).not.toHaveBeenCalled()
  })

  it('trop de retours depuis une IP → ?erreur=trop, sans appeler Google', async () => {
    for (let i = 0; i < 300; i++) await isBlocked(db, 'google', { ip: '203.0.113.9' })
    const res = await roundTrip('eleve', eleveId('alice.exemple@malraux-rabat.org'))
    expect(location(res)).toBe('/connexion?erreur=trop')
    expect(google.finishGoogleLogin).not.toHaveBeenCalled()
    expectPendingCleared(res)
  })
})

describe('journal des échecs (une ligne, sans données personnelles ni secrets)', () => {
  const CODE = 'code-de-test'
  const SECRET = 'secret-google-de-test'
  const EMAIL = 'alice.exemple@malraux-rabat.org'

  /** Capture la console ; rend les lignes écrites. */
  function capture() {
    const lines: string[] = []
    const push = (...a: unknown[]) => void lines.push(a.map(String).join(' '))
    for (const m of ['error', 'warn', 'log', 'info'] as const) vi.spyOn(console, m).mockImplementation(push)
    return lines
  }
  /** Exactement une ligne, préfixée, contenant la cause, sans l'adresse, le code, le secret ni le jeton. */
  function expectOneLine(lines: string[], cause: string, forbidden: string[] = []) {
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line.startsWith('[connexion Google] ')).toBe(true)
    expect(line).toContain(cause)
    for (const f of [EMAIL, 'alice.exemple', '@', CODE, SECRET, ...forbidden]) expect(line).not.toContain(f)
  }

  let key: CryptoKey
  let jwks: JWTVerifyGetKey
  const token = (claims: Record<string, unknown> = {}, aud = 'client-test.apps.googleusercontent.com') =>
    new SignJWT({ email: EMAIL, email_verified: true, hd: 'malraux-rabat.org', sub: '42', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k' }).setIssuer('https://accounts.google.com').setAudience(aud)
      .setIssuedAt().setExpirationTime('1h').sign(key)
  const tokenEndpoint = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

  beforeEach(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true })
    key = pair.privateKey
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'RS256' }] })
  })

  it.each(['invalid_client', 'redirect_uri_mismatch', 'invalid_grant'])('point de jeton HTTP 400 %s : statut et champ error seuls', async (error) => {
    ctx.google = { fetch: tokenEndpoint({ error, error_description: `Bad ${CODE} ${SECRET} pour ${EMAIL} description-google` }, 400), jwks }
    const lines = capture()
    const res = await roundTrip('eleve', null)
    expect(location(res)).toBe('/connexion?erreur=echec')
    expectOneLine(lines, `point de jeton : HTTP 400, ${error}`, ['description-google', 'Bad'])
  })

  it("jeton refusé (mauvais aud) : code jose et revendication, jamais l'id_token", async () => {
    const idToken = await token({}, 'autre-client.apps.googleusercontent.com')
    ctx.google = { fetch: tokenEndpoint({ id_token: idToken }), jwks }
    const lines = capture()
    expect(location(await roundTrip('eleve', null))).toBe('/connexion?erreur=echec')
    expectOneLine(lines, 'ERR_JWT_CLAIM_VALIDATION_FAILED (aud)', idToken.split('.'))
  })

  it('jeton refusé (nonce) : cause nommée', async () => {
    const idToken = await token({ nonce: 'pas-le-bon' })
    ctx.google = { fetch: tokenEndpoint({ id_token: idToken }), jwks }
    const lines = capture()
    expect(location(await roundTrip('enseignant', null))).toBe('/admin/login?erreur=echec')
    expectOneLine(lines, "jeton d'identité refusé : nonce", [...idToken.split('.'), 'pas-le-bon'])
  })

  it('clés de Google (JWKS) injoignables : code jose', async () => {
    const idToken = await token()
    ctx.google = { fetch: tokenEndpoint({ id_token: idToken }), jwks: async () => { throw new errors.JWKSTimeout() } }
    const lines = capture()
    await roundTrip('eleve', null)
    expectOneLine(lines, 'ERR_JWKS_TIMEOUT', idToken.split('.'))
  })

  it('secret absent au retour : « non configurée »', async () => {
    ctx.google = { fetch: tokenEndpoint({}), jwks }
    const res0 = await start(new NextRequest(`${ORIGIN}/auth/google/eleve`), params('eleve'))
    const sealed = cookieNamed(res0, 'google_login')!.split(';')[0].slice('google_login='.length)
    const state = new URL(res0.headers.get('location')!).searchParams.get('state')!
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    const lines = capture()
    const res = await callback(new NextRequest(`${ORIGIN}/auth/google/callback?code=${CODE}&state=${encodeURIComponent(state)}`, {
      headers: { cookie: `google_login=${sealed}` },
    }))
    expect(location(res)).toBe('/connexion?erreur=echec')
    expectOneLine(lines, 'non configurée (GOOGLE_CLIENT_SECRET absent)')
  })

  it('identifiant absent au départ : « non configurée »', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const lines = capture()
    const res = await start(new NextRequest(`${ORIGIN}/auth/google/enseignant`), params('enseignant'))
    expect(location(res)).toBe('/admin/login?erreur=echec')
    expectOneLine(lines, 'départ impossible : non configurée (GOOGLE_CLIENT_ID absent)')
  })

  it("base indisponible après Google : message du pilote, jamais l'adresse", async () => {
    await enroll(EMAIL)
    ctx.dbFail = true
    const lines = capture()
    expect(location(await roundTrip('eleve', eleveId(EMAIL)))).toBe('/connexion?erreur=echec')
    expectOneLine(lines, 'base (rôle eleve) : base indisponible', ['Failed query', 'params'])
  })

  it('base indisponible au contrôle des tentatives', async () => {
    ctx.limitFail = true
    const lines = capture()
    expect(location(await roundTrip('eleve', eleveId(EMAIL)))).toBe('/connexion?erreur=echec')
    expectOneLine(lines, 'base (limite de tentatives) : connect ECONNREFUSED')
  })

  it.each([
    ['access_denied', '/connexion'],
    ['admin_policy_enforced', '/connexion?erreur=echec'],
    ['org_internal', '/connexion?erreur=echec'],
  ])('erreur renvoyée par Google (%s) : sa valeur', async (error, to) => {
    const lines = capture()
    const res = await roundTrip('eleve', null, { query: `error=${error}&state=x` })
    expect(location(res)).toBe(to)
    expectOneLine(lines, `erreur renvoyée par Google : ${error}`)
  })

  it("erreur renvoyée par Google de forme inattendue : la valeur n'est pas recopiée", async () => {
    const lines = capture()
    await roundTrip('eleve', null, { query: `error=${encodeURIComponent(EMAIL + ' <b>')}&state=x` })
    expectOneLine(lines, 'valeur inattendue', ['<b>'])
  })

  it('retour sans cookie, ou state différent : une ligne', async () => {
    let lines = capture()
    await roundTrip('eleve', null, { cookie: false })
    expectOneLine(lines, 'retour sans connexion en cours (cookie absent)')
    vi.restoreAllMocks()
    lines = capture()
    await roundTrip('eleve', null, { state: 'autre-etat' })
    expectOneLine(lines, 'state différent', ['autre-etat'])
  })

  it('connexion réussie : aucune ligne', async () => {
    await enroll(EMAIL)
    const lines = capture()
    expect((await roundTrip('eleve', eleveId(EMAIL))).status).toBe(200)
    expect(lines).toEqual([])
  })
})

describe('connexion de développement', () => {
  const form = (fields: Record<string, string>) => {
    const body = new URLSearchParams(fields)
    return new NextRequest(`${ORIGIN}/auth/dev`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  }
  const enable = () => { vi.stubEnv('GOOGLE_CLIENT_ID', ''); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('VERCEL', '') }

  it('ouvre la session admin choisie', async () => {
    enable()
    const t = await createTeacher(db, { email: 'admin.test@malraux-rabat.org', username: 'admin.test', firstName: 'Admin', lastName: 'Test', role: 'admin' })
    const res = await devLogin(form({ kind: 'enseignant', id: t.id }))
    expect(res.status).toBe(303)
    expect(location(res)).toBe('/admin')
    expect(cookieNamed(res, 'admin_session')).toBeDefined()
  })

  it("ouvre la session de l'élève choisi", async () => {
    enable()
    const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    const res = await devLogin(form({ kind: 'eleve', id: s.id }))
    expect(res.status).toBe(303)
    expect(location(res)).toBe('/')
    expect(cookieNamed(res, 'student_session')).toBeDefined()
  })

  it('compte inconnu ou enseignant désactivé → retour à la connexion, sans session', async () => {
    enable()
    const t = await createTeacher(db, { email: 'bob.modele@malraux-rabat.org', username: 'bob.modele', firstName: 'Bob', lastName: 'Modele', role: 'prof', isActive: false })
    for (const f of [{ kind: 'enseignant', id: t.id }, { kind: 'eleve', id: 'inconnu' }, { kind: 'autre', id: t.id }]) {
      const res = await devLogin(form(f))
      expect(res.status).toBe(303)
      expectNoSession(res)
    }
  })

  it("refuse un formulaire envoyé depuis un autre site", async () => {
    enable()
    const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    const req = new NextRequest(`${ORIGIN}/auth/dev`, {
      method: 'POST', body: new URLSearchParams({ kind: 'eleve', id: s.id }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://autre-site.example' },
    })
    const res = await devLogin(req)
    expect(res.status).toBe(403)
    expectNoSession(res)
    const noOrigin = new NextRequest(`${ORIGIN}/auth/dev`, {
      method: 'POST', body: new URLSearchParams({ kind: 'eleve', id: s.id }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'cross-site' },
    })
    const res2 = await devLogin(noOrigin)
    expect(res2.status).toBe(403)
    expectNoSession(res2)
  })

  const off: [string, () => void][] = [
    ['GOOGLE_CLIENT_ID défini', () => { enable(); vi.stubEnv('GOOGLE_CLIENT_ID', 'client-test.apps.googleusercontent.com') }],
    ['NODE_ENV=production', () => { enable(); vi.stubEnv('NODE_ENV', 'production') }],
    ['VERCEL défini', () => { enable(); vi.stubEnv('VERCEL', '1') }],
  ]
  it.each(off)('404 si %s', async (_nom, setup) => {
    setup()
    const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    const res = await devLogin(form({ kind: 'eleve', id: s.id }))
    expect(res.status).toBe(404)
    expectNoSession(res)
  })
})
