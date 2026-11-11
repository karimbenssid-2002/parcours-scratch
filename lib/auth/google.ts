import 'server-only'
import { base64url, createRemoteJWKSet, errors, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose'
import { secretKey } from '@/lib/auth/jwt'
import { SCHOOL_DOMAIN } from '@/lib/auth/validation'
import type { GoogleIdentity, LoginKind } from '@/lib/auth/identity'

// Flux OpenID Connect de Google (code d'autorisation + PKCE + state + nonce).
// Ni le secret, ni le code, ni les jetons de Google ne figurent dans les messages d'erreur, ni dans leur `detail`.

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** Cookie qui porte la connexion en cours, entre le départ vers Google et le retour. */
export const PENDING_COOKIE = 'google_login'
/** Durée de vie de la connexion en cours, en secondes. */
export const PENDING_MAX_AGE = 10 * 60
const PENDING_AUDIENCE = 'google_login'

export type PendingLogin = { kind: LoginKind; state: string; nonce: string; verifier: string }

const FAILED = 'La connexion Google a échoué.'
const NOT_CONFIGURED = "La connexion Google n'est pas configurée."

/**
 * Échec de la connexion Google. `message` reste générique ; `detail` est la cause, courte et non personnelle, pour le
 * journal (statut HTTP et champ `error` du point de jeton, code jose, variable absente) : jamais l'adresse, le code,
 * un jeton, le secret ni l'`error_description` de Google.
 */
export class GoogleLoginError extends Error {
  constructor(readonly detail: string, message = FAILED) {
    super(message)
    this.name = 'GoogleLoginError'
  }
}

/** Code d'erreur OAuth de Google (`invalid_grant`, `access_denied`…) tel quel s'il en a la forme, sinon rien. */
export function oauthErrorCode(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/i.test(value) ? value : null
}

function requiredEnv(name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'): string {
  const v = process.env[name]
  if (!v) throw new GoogleLoginError(`non configurée (${name} absent)`, NOT_CONFIGURED)
  return v
}

const clientId = () => requiredEnv('GOOGLE_CLIENT_ID')
const clientSecret = () => requiredEnv('GOOGLE_CLIENT_SECRET')

/** Cause d'un refus du jeton d'identité : code jose (et revendication en cause), ou nom de l'erreur. */
function joseDetail(e: unknown): string {
  if (e instanceof GoogleLoginError) return e.detail
  if (e instanceof errors.JOSEError) {
    const claim = 'claim' in e && typeof e.claim === 'string' ? ` (${e.claim})` : ''
    return `jeton d'identité refusé : ${e.code}${claim}`
  }
  return `jeton d'identité refusé : ${e instanceof Error ? e.name : 'erreur inconnue'}`
}

/** Valeur aléatoire (CSPRNG) encodée en base64url : 32 octets → 43 caractères. */
function randomToken(): string {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url.encode(new Uint8Array(digest))
}

/** URL de la page Google et connexion en cours à sceller dans le cookie `google_login`. */
export async function startGoogleLogin(kind: LoginKind, redirectUri: string): Promise<{ url: string; pending: PendingLogin }> {
  const pending: PendingLogin = { kind, state: randomToken(), nonce: randomToken(), verifier: randomToken() }
  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
    // Simple indice pour la page Google : la vérification porte sur le `hd` du jeton signé.
    hd: kind === 'eleve' ? SCHOOL_DOMAIN : '*',
  }).toString()
  return { url: url.toString(), pending }
}

/** Jeton signé (AUTH_SECRET, 10 min), d'une audience distincte des sessions. */
export async function sealPending(p: PendingLogin): Promise<string> {
  return new SignJWT({ kind: p.kind, state: p.state, nonce: p.nonce, verifier: p.verifier })
    .setProtectedHeader({ alg: 'HS256' }).setAudience(PENDING_AUDIENCE).setIssuedAt()
    .setExpirationTime(`${PENDING_MAX_AGE}s`).sign(secretKey('AUTH_SECRET'))
}

export async function openPending(token: string): Promise<PendingLogin | null> {
  try {
    const { payload: p } = await jwtVerify(token, secretKey('AUTH_SECRET'), { audience: PENDING_AUDIENCE, algorithms: ['HS256'] })
    if (p.kind !== 'eleve' && p.kind !== 'enseignant') return null
    if (typeof p.state !== 'string' || typeof p.nonce !== 'string' || typeof p.verifier !== 'string') return null
    return { kind: p.kind, state: p.state, nonce: p.nonce, verifier: p.verifier }
  } catch {
    return null
  }
}

let googleJwks: JWTVerifyGetKey | undefined

/** Échange le code contre le jeton d'identité de Google, le vérifie et rend ce qu'il affirme. */
export async function finishGoogleLogin(
  code: string,
  pending: PendingLogin,
  redirectUri: string,
  deps: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey } = {},
): Promise<GoogleIdentity> {
  const id = clientId()
  const secret = clientSecret()
  const doFetch = deps.fetch ?? fetch
  const jwks = deps.jwks ?? (googleJwks ??= createRemoteJWKSet(JWKS_URL))

  let res: Response
  try {
    res = await doFetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        code_verifier: pending.verifier,
      }).toString(),
      cache: 'no-store',
      // Google ne répond pas : abandon au bout de 10 s (même erreur générique).
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    throw new GoogleLoginError(`point de jeton injoignable (${e instanceof Error ? e.name : 'erreur inconnue'})`)
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    // Seul le champ `error` (invalid_client, redirect_uri_mismatch, invalid_grant…) : jamais `error_description`.
    const error = oauthErrorCode(body && typeof body === 'object' ? (body as { error?: unknown }).error : null)
    throw new GoogleLoginError(`point de jeton : HTTP ${res.status}${error ? `, ${error}` : ''}`)
  }
  const idToken = body && typeof body === 'object' ? (body as { id_token?: unknown }).id_token : undefined
  if (typeof idToken !== 'string') throw new GoogleLoginError('point de jeton : réponse sans id_token')

  const refuse = (what: string) => new GoogleLoginError(`jeton d'identité refusé : ${what}`)
  try {
    const { payload: p } = await jwtVerify(idToken, jwks, {
      issuer: ISSUERS, audience: id, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'], clockTolerance: 30,
    })
    // OIDC : un jeton destiné à plusieurs clients n'est pas accepté ; s'il nomme un client autorisé (azp), c'est nous.
    if (p.aud !== id) throw refuse('aud multiple')
    if (p.azp !== undefined && p.azp !== id) throw refuse('azp')
    if (p.nonce !== pending.nonce) throw refuse('nonce')
    if (typeof p.email !== 'string' || p.email === '') throw refuse('email absent')
    return { email: p.email, emailVerified: p.email_verified === true, hd: typeof p.hd === 'string' ? p.hd : null }
  } catch (e) {
    throw new GoogleLoginError(joseDetail(e))
  }
}
