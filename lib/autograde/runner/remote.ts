import 'server-only'
import { decodeJwt, importPKCS8, SignJWT } from 'jose'
import type { RunOptions, RunResult } from './types'

type Run = (bytes: Uint8Array, base: Omit<RunOptions, 'seed'>, seeds?: number[]) => Promise<RunResult>

/** Échec du service d'exécution. Le message reste générique : jamais la clé, le jeton, ni le corps d'une réponse. */
export class RunnerError extends Error {
  /** Vrai si le service est resté indisponible (429/503/réseau) malgré les nouveaux essais. */
  readonly unavailable: boolean
  readonly status?: number
  /** Vrai si la demande est bien partie vers le service d'exécution (il a donc été sollicité) : à compter dans les appels. */
  readonly reachedService: boolean
  constructor(message: string, unavailable: boolean, status?: number, reachedService = false) {
    super(message)
    this.name = 'RunnerError'
    this.unavailable = unavailable
    this.reachedService = reachedService
    if (status !== undefined) this.status = status
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Jeton d'identité Google pour appeler le service Cloud Run (IAM « roles/run.invoker »), obtenu à partir de la clé
// JSON d'un compte de service : JWT auto-signé (RS256) avec `target_audience` = adresse du service, échangé contre un
// jeton signé par Google (champ `id_token`). Gardé en mémoire jusqu'à 5 minutes avant son expiration.

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
const REFRESH_MARGIN_MS = 5 * 60_000

export type TokenSource = (() => Promise<string>) & { invalidate: () => void }
type ServiceAccountKey = { client_email: string; private_key: string; private_key_id?: string }

const authError = (status?: number) => new RunnerError('Authentification auprès du service d’exécution impossible.', false, status)
const keyError = () => new RunnerError('Clé du compte de service illisible (AUTOGRADE_RUNNER_SA_KEY).', false)

function parseKey(encoded: string): ServiceAccountKey {
  try {
    const text = encoded.trim().startsWith('{') ? encoded : Buffer.from(encoded, 'base64').toString('utf8')
    const key = JSON.parse(text) as Partial<ServiceAccountKey>
    if (typeof key.client_email === 'string' && typeof key.private_key === 'string') return key as ServiceAccountKey
  } catch { /* message générique ci-dessous */ }
  throw keyError()
}

/** Source de jetons d'identité Google pour `audience` (l'adresse du service), à partir de la clé (JSON en base64). */
export function googleIdToken(saKey: string, audience: string, opts: { fetch?: typeof fetch; now?: () => number } = {}): TokenSource {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = opts.now ?? Date.now
  let cached: { token: string; expiresAt: number } | null = null
  let pending: Promise<string> | null = null

  async function request(): Promise<string> {
    const key = parseKey(saKey)
    let assertion: string
    try {
      const iat = Math.floor(now() / 1000)
      assertion = await new SignJWT({ target_audience: audience })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(key.private_key_id ? { kid: key.private_key_id } : {}) })
        .setIssuer(key.client_email).setSubject(key.client_email).setAudience(GOOGLE_TOKEN_URL)
        .setIssuedAt(iat).setExpirationTime(iat + 3600)
        .sign(await importPKCS8(key.private_key, 'RS256'))
    } catch {
      throw keyError()
    }
    let res: Response
    try {
      res = await doFetch(GOOGLE_TOKEN_URL, {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: JWT_BEARER, assertion }).toString(),
      })
    } catch {
      throw new RunnerError('Service d’authentification de Google injoignable.', true)
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      throw authError(res.status)
    }
    let token: unknown
    try { token = ((await res.json()) as { id_token?: unknown }).id_token } catch { token = undefined }
    if (typeof token !== 'string' || !token) throw authError(res.status)
    let exp: number | undefined
    try { exp = decodeJwt(token).exp } catch { exp = undefined }
    cached = { token, expiresAt: exp ? exp * 1000 : now() + 55 * 60_000 }
    return token
  }

  const get = async () => {
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token
    pending ??= request().finally(() => { pending = null })
    return pending
  }
  return Object.assign(get, { invalidate: () => { cached = null } })
}

// ---------------------------------------------------------------------------------------------------------------

/** Délai d'un appel : sous la durée maximale d'une fonction Vercel (300 s) et celle du service. */
const TIMEOUT_MS = 290_000
/** Pauses avant les essais suivants, quand le service est occupé (429/503) ou injoignable : assez longues pour qu'une
 * instance se libère (rafale de copies sur un service à 10 instances), 37 s au total (44 s avec la gigue). */
const PAUSES_MS = [2_000, 5_000, 10_000, 20_000]
/** Gigue : chaque pause est allongée de 0 à 20 %, pour que les copies d'une même rafale ne reviennent pas ensemble. */
const JITTER = 0.2
/** Au-delà, plus de nouvel essai après une pause ; le délai de chaque essai est borné de sorte que le tout tienne dans les 290 s. */
const DEADLINE_MS = 270_000
const RETRY_STATUSES = new Set([429, 503])

const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
const looksLikeResult = (r: unknown): r is RunResult => !!r && typeof r === 'object' && 'project' in r && Array.isArray((r as RunResult).traces)

/**
 * Exécuteur distant : envoie le projet au service d'exécution (Cloud Run, runner-service/) avec le jeton que donne
 * `token`, et renvoie ses relevés. Jusqu'à 5 essais (pauses de 2, 5, 10 puis 20 s) si le service est occupé ou injoignable, dans les 270 s ; toute autre erreur lève
 * aussitôt une RunnerError.
 */
export function remoteRun(url: string, token: (() => Promise<string>) & { invalidate?: () => void }, opts: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number; now?: () => number } = {}): Run {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const random = opts.random ?? Math.random
  const clock = opts.now ?? Date.now
  const endpoint = `${url.replace(/\/+$/, '')}/run`

  return async (bytes, base, seeds) => {
    const body = JSON.stringify({ project: Buffer.from(bytes).toString('base64'), base, ...(seeds ? { seeds } : {}) })
    const started = clock()
    // Pause avant le prochain essai, ou faux s'il n'y en a plus (essais épuisés, ou échéance globale dépassée par la pause).
    const pause = async (attempt: number) => {
      if (attempt >= PAUSES_MS.length) return false
      const ms = Math.round(PAUSES_MS[attempt] * (1 + random() * JITTER))
      if (clock() - started + ms >= DEADLINE_MS) return false
      await sleep(ms)
      return true
    }
    for (let attempt = 0; ; attempt++) {
      let bearer: string
      try { bearer = await token() } catch (e) { throw e instanceof RunnerError ? e : authError() }
      let res: Response
      try {
        res = await doFetch(endpoint, {
          method: 'POST', body, signal: AbortSignal.timeout(Math.max(1_000, TIMEOUT_MS - (clock() - started))),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        })
      } catch (e) {
        if (isTimeout(e)) throw new RunnerError('Le service d’exécution n’a pas répondu à temps.', false, undefined, true)
        if (await pause(attempt)) continue
        throw new RunnerError('Service d’exécution injoignable.', true, undefined, true)
      }
      if (res.ok) {
        let result: unknown
        try { result = await res.json() } catch { result = null }
        if (!looksLikeResult(result)) throw new RunnerError('Réponse illisible du service d’exécution.', false, res.status, true)
        return result
      }
      await res.body?.cancel().catch(() => {}) // corps jamais lu ni recopié
      if (RETRY_STATUSES.has(res.status)) {
        if (await pause(attempt)) continue
        throw new RunnerError('Service d’exécution occupé, réessayez plus tard.', true, res.status, true)
      }
      if (res.status === 401 || res.status === 403) token.invalidate?.() // jeton refusé : un nouveau à la prochaine demande
      throw new RunnerError(`Le service d’exécution a refusé la demande (code ${res.status}).`, false, res.status, true)
    }
  }
}

/**
 * Limite le nombre d'appels simultanés en cours dans ce processus (file d'attente FIFO) : une rafale de copies ne
 * dépasse pas ce que le service peut absorber (10 instances à une exécution chacune).
 */
export function limitConcurrency(run: Run, max: number): Run {
  let active = 0
  const waiting: (() => void)[] = []
  const acquire = () => (active < max ? (active++, Promise.resolve()) : new Promise<void>((resolve) => waiting.push(resolve)))
  const release = () => { const next = waiting.shift(); if (next) next(); else active-- } // la place passe directement au suivant
  return async (bytes, base, seeds) => {
    await acquire()
    try { return await run(bytes, base, seeds) } finally { release() }
  }
}

/** Jeton fixe (essais locaux contre un service lancé avec RUNNER_DEV_SECRET). */
export const fixedToken = (value: string) => async () => value
