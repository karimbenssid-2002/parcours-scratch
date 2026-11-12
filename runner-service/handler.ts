// Service d'exécution (Cloud Run) : reçoit un projet Scratch et ses réglages, l'exécute et renvoie les relevés.
// Il ne connaît ni la base, ni le stockage, ni la clé de l'IA, et ne détient aucun secret : sur Cloud Run, l'accès est
// contrôlé par IAM avant que la requête n'arrive (jeton d'identité Google, « roles/run.invoker »). Rien n'est écrit
// sur disque ni journalisé du projet.
import { createHash, timingSafeEqual } from 'node:crypto'
import { readBodyLimited } from '../lib/http/body'
import type { KeyPress, RunOptions, RunResult } from '../lib/autograde/runner/types'

type Run = (bytes: Uint8Array, base: Omit<RunOptions, 'seed'>, seeds?: number[], control?: { signal?: AbortSignal }) => Promise<RunResult>

/** Taille maximale d'un projet (celle du site : 20 Mo), une fois décodé. */
export const MAX_PROJECT_BYTES = 20 * 1024 * 1024
/** Corps maximal : le projet en base64 (4 octets pour 3) et les réglages. Au-delà, la lecture s'arrête aussitôt. */
export const MAX_BODY_BYTES = Math.ceil(MAX_PROJECT_BYTES / 3) * 4 + 1024 * 1024
export const MIN_SECRET_LENGTH = 32
/** Au plus 5 graines (celles du site) : chacune peut durer 20 s + 60 s au pire. */
export const MAX_SEEDS = 5
/** Échéance globale d'une requête, sous le délai du client (290 s) et celui de Cloud Run (300 s) : passé ce délai,
 * les exécutions restantes sont coupées (traces « cut ») et la réponse part. */
export const DEADLINE_MS = 270_000

/** Secret de développement (essais locaux seulement, jamais sur Cloud Run) : lu puis retiré de l'environnement. */
export function takeDevSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  const secret = env.RUNNER_DEV_SECRET || undefined
  delete env.RUNNER_DEV_SECRET
  return secret
}

/** Démarrage permis : sur Cloud Run (K_SERVICE défini, IAM devant le service), ou en local avec un secret de
 * développement assez long. Sinon, le message d'erreur (le service ne doit jamais tourner sans protection). */
export function startupProblem(env: Record<string, string | undefined>, devSecret: string | undefined): string | null {
  if (devSecret !== undefined) return devSecret.length < MIN_SECRET_LENGTH ? `RUNNER_DEV_SECRET trop court (${MIN_SECRET_LENGTH} caractères au moins).` : null
  return env.K_SERVICE ? null : 'Hors de Cloud Run, RUNNER_DEV_SECRET est obligatoire (aucun accès sans protection).'
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const reply = (status: number, error: string) => Response.json({ error }, { status })
const digest = (s: string) => createHash('sha256').update(s).digest()

const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** Réglages reçus, recopiés champ par champ (rien d'autre n'est transmis à l'exécuteur), ou null s'ils sont invalides. */
function parseBase(v: unknown): Omit<RunOptions, 'seed'> | null {
  if (!v || typeof v !== 'object') return null
  const { answers, keys, durationMs } = v as Record<string, unknown>
  if (!Array.isArray(answers) || answers.length > 100 || !answers.every((a) => isString(a, 2000))) return null
  if (!Array.isArray(keys) || keys.length > 100) return null
  const parsedKeys: KeyPress[] = []
  for (const k of keys) {
    if (!k || typeof k !== 'object') return null
    const { key, times } = k as Record<string, unknown>
    if (!isString(key, 50) || !isInt(times, 0, 1000)) return null
    parsedKeys.push({ key, times })
  }
  if (!isInt(durationMs, 1, 60_000)) return null
  return { answers: [...answers], keys: parsedKeys, durationMs }
}

/**
 * Gestionnaire HTTP du service : GET / (santé), POST /run (exécution). Avec `devSecret` (essais locaux), POST /run
 * exige `Authorization: Bearer <devSecret>` ; sans lui, l'accès est contrôlé en amont par Cloud Run (IAM).
 */
export function createRunnerHandler(deps: { run: Run; devSecret?: string; deadlineMs?: number }): (req: Request) => Promise<Response> {
  if (deps.devSecret !== undefined && deps.devSecret.length < MIN_SECRET_LENGTH) throw new Error(`Secret de développement trop court (${MIN_SECRET_LENGTH} caractères au moins).`)
  const expected = deps.devSecret === undefined ? null : digest(`Bearer ${deps.devSecret}`)
  let busy = false

  return async (req) => {
    const { pathname } = new URL(req.url)
    if (req.method === 'GET' && pathname === '/') return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    if (req.method !== 'POST' || pathname !== '/run') return reply(404, 'Introuvable.')

    // Comparaison à temps constant (empreintes de même longueur, quelle que soit celle de l'en-tête reçu).
    if (expected && !timingSafeEqual(digest(req.headers.get('authorization') ?? ''), expected)) return reply(401, 'Non autorisé.')
    // Une exécution à la fois par instance (Cloud Run : concurrency 1) ; le client réessaie après une pause.
    if (busy) return reply(503, 'Service occupé.')

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(413, 'Projet trop volumineux.')
    busy = true
    try {
      let raw: Uint8Array | null
      try { raw = await readBodyLimited(req, MAX_BODY_BYTES) } catch { return reply(400, 'Demande interrompue.') }
      if (!raw) return reply(413, 'Projet trop volumineux.')
      let body: unknown
      try { body = JSON.parse(new TextDecoder().decode(raw)) } catch { return reply(400, 'Demande invalide.') }
      if (!body || typeof body !== 'object') return reply(400, 'Demande invalide.')
      const { project, base: rawBase, seeds } = body as Record<string, unknown>
      const base = parseBase(rawBase)
      if (typeof project !== 'string' || !base) return reply(400, 'Demande invalide.')
      if (seeds !== undefined && (!Array.isArray(seeds) || seeds.length === 0 || seeds.length > MAX_SEEDS || !seeds.every((s) => isInt(s, 0, 2 ** 31 - 1))))
        return reply(400, 'Demande invalide.')
      // Taille décodée calculée avant de décoder : un projet trop gros n'est jamais alloué.
      const padding = project.endsWith('==') ? 2 : project.endsWith('=') ? 1 : 0
      if (Math.floor((project.length * 3) / 4) - padding > MAX_PROJECT_BYTES) return reply(413, 'Projet trop volumineux.')
      if (project.length % 4 !== 0 || !BASE64.test(project)) return reply(400, 'Demande invalide.')
      const bytes = new Uint8Array(Buffer.from(project, 'base64'))
      // Échéance globale, ou client parti (req.signal) : les exécutions restantes sont coupées et « busy » libéré.
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(deps.deadlineMs ?? DEADLINE_MS)])
      let result: RunResult
      try {
        result = await deps.run(bytes, base, seeds as number[] | undefined, { signal })
      } catch (e) {
        console.error(`Exécution impossible : ${e instanceof Error ? e.name : 'erreur'}`) // jamais le message (contenu possible)
        return reply(500, 'Exécution impossible.')
      }
      return Response.json(result)
    } finally {
      busy = false
    }
  }
}
