import { describe, expect, it, vi } from 'vitest'
import { createRunnerHandler, MAX_BODY_BYTES, startupProblem, takeDevSecret } from '@/runner-service/handler'
import type { RunResult } from '@/lib/autograde/runner/types'

const SECRET = 'secret-de-test-inventé-0123456789abcdef'
const base = { answers: ['Zoé'], keys: [{ key: ' ', times: 2 }], durationMs: 3000 }
const result: RunResult = { project: { targets: [] }, traces: [] }

function setup(run = vi.fn(async () => result)) {
  return { run, handle: createRunnerHandler({ run, devSecret: SECRET }) }
}
function post(body: string, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return new Request('http://service.invalid/run', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } })
}
const json = (o: unknown) => JSON.stringify(o)

describe('service d’exécution', () => {
  it('GET / répond « ok » sans secret (contrôle de santé) ; toute autre route : 404', async () => {
    const { handle, run } = setup()
    const ok = await handle(new Request('http://service.invalid/'))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('ok')
    expect((await handle(new Request('http://service.invalid/autre', { method: 'POST' }))).status).toBe(404)
    expect((await handle(new Request('http://service.invalid/run'))).status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it('sans secret ou avec un mauvais secret : 401, rien n’est exécuté', async () => {
    const { handle, run } = setup()
    const body = json({ project: 'AAAA', base })
    expect((await handle(post(body, {}))).status).toBe(401)
    expect((await handle(post(body, { authorization: `Bearer ${SECRET}x` }))).status).toBe(401)
    expect((await handle(post(body, { authorization: 'Bearer autre-secret' }))).status).toBe(401)
    expect((await handle(post(body, { authorization: SECRET }))).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })

  it('projet de plus de 20 Mo (une fois décodé) : 413', async () => {
    const { handle, run } = setup()
    const big = Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')
    const res = await handle(post(json({ project: big, base })))
    expect(res.status).toBe(413)
    expect(run).not.toHaveBeenCalled()
    // Exactement 20 Mo : accepté.
    const limit = Buffer.alloc(20 * 1024 * 1024).toString('base64')
    expect((await handle(post(json({ project: limit, base })))).status).toBe(200)
  })

  it('corps annoncé ou reçu au-delà de la limite : 413 sans tout lire', async () => {
    const { handle, run } = setup()
    const announced = new Request('http://service.invalid/run', {
      method: 'POST', body: 'x', headers: { authorization: `Bearer ${SECRET}`, 'content-length': String(MAX_BODY_BYTES + 1) },
    })
    expect((await handle(announced)).status).toBe(413)
    // Envoyé par morceaux, sans longueur annoncée : la lecture s'arrête à la limite.
    let sent = 0
    const chunk = new Uint8Array(1024 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { if (sent > MAX_BODY_BYTES * 3) return c.close(); sent += chunk.byteLength; c.enqueue(chunk) },
    })
    const chunked = new Request('http://service.invalid/run', { method: 'POST', body: stream, headers: { authorization: `Bearer ${SECRET}` }, duplex: 'half' } as RequestInit)
    expect((await handle(chunked)).status).toBe(413)
    expect(sent).toBeLessThan(MAX_BODY_BYTES + 3 * chunk.byteLength)
    expect(run).not.toHaveBeenCalled()
  })

  it('JSON invalide ou réglages invalides : 400', async () => {
    const { handle, run } = setup()
    expect((await handle(post('{pas du json'))).status).toBe(400)
    expect((await handle(post(json({ base })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA' })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA', base: { ...base, durationMs: 'long' } })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA', base: { ...base, answers: [1] } })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA', base: { ...base, keys: [{ key: ' ' }] } })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA', base, seeds: [1.5] })))).status).toBe(400)
    expect((await handle(post(json({ project: 'AAAA', base, seeds: [1, 2, 3, 4, 5, 6] })))).status).toBe(400)
    expect((await handle(post(json({ project: 'pas du base64 !', base })))).status).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it('requête valide : exécute les octets décodés avec les réglages et renvoie le RunResult', async () => {
    const { handle, run } = setup()
    const bytes = Buffer.from('projet scratch inventé')
    const res = await handle(post(json({ project: bytes.toString('base64'), base: { ...base, autre: 'ignoré' }, seeds: [1] })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(result)
    expect(run).toHaveBeenCalledTimes(1)
    const [got, gotBase, seeds, control] = run.mock.calls[0] as unknown as [Uint8Array, unknown, number[] | undefined, { signal: AbortSignal }]
    expect(control.signal).toBeInstanceOf(AbortSignal)
    expect(Buffer.from(got).equals(bytes)).toBe(true)
    expect(gotBase).toEqual(base)
    expect(seeds).toEqual([1])
    // Sans graines : celles par défaut de l'exécuteur.
    await handle(post(json({ project: bytes.toString('base64'), base })))
    expect(run.mock.calls[1]).toHaveLength(4)
    expect((run.mock.calls[1] as unknown[])[2]).toBeUndefined()
  })

  it('une exécution à la fois : 503 si une autre est en cours', async () => {
    let release!: () => void
    const run = vi.fn(() => new Promise<RunResult>((resolve) => { release = () => resolve(result) }))
    const { handle } = setup(run)
    const body = json({ project: 'AAAA', base })
    const first = handle(post(body))
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect((await handle(post(body))).status).toBe(503)
    release()
    expect((await first).status).toBe(200)
    const third = handle(post(body)) // de nouveau libre
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    release()
    expect((await third).status).toBe(200)
  })

  it('exécution en échec : 500 avec un message générique, journal sans le message de l’erreur', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn(async () => { throw new TypeError(`détail interne ${SECRET}`) })
    const { handle } = setup(run)
    const res = await handle(post(json({ project: 'AAAA', base })))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('détail interne')
    expect(log.mock.calls.flat().join(' ')).toContain('TypeError')
    expect(log.mock.calls.flat().join(' ')).not.toContain('détail interne')
    log.mockRestore()
  })

  /** Exécuteur factice qui, comme runMany, s'arrête au signal et note les exécutions restantes coupées. */
  const cutOnAbort = () => vi.fn((_b: Uint8Array, _base: unknown, _s?: number[], control?: { signal?: AbortSignal }) => new Promise<RunResult>((resolve) => {
    control?.signal?.addEventListener('abort', () => resolve({ project: null, traces: [{ ...cutTrace }] }), { once: true })
  }))
  const cutTrace = { finished: false, timedOut: true, error: null, cut: true as const, says: [], questions: [], variables: {}, lists: {}, sprites: [], costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' } }

  it('échéance globale : les exécutions restantes sont coupées et la réponse part', async () => {
    const run = cutOnAbort()
    const handle = createRunnerHandler({ run, devSecret: SECRET, deadlineMs: 50 })
    const start = Date.now()
    const res = await handle(post(json({ project: 'AAAA', base })))
    expect(res.status).toBe(200)
    expect((await res.json()).traces[0]).toMatchObject({ cut: true, timedOut: true })
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('client parti : exécution arrêtée, instance de nouveau libre', async () => {
    const run = cutOnAbort()
    const handle = createRunnerHandler({ run, devSecret: SECRET })
    const client = new AbortController()
    const body = json({ project: 'AAAA', base })
    const first = handle(new Request('http://service.invalid/run', { method: 'POST', body, signal: client.signal, headers: { authorization: `Bearer ${SECRET}` } }))
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect((await handle(post(body))).status).toBe(503)
    client.abort()
    await first
    const second = handle(post(body))
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)) // plus de 503 : l'exécution a démarré
    ;(run.mock.calls[1][3] as { signal: AbortSignal }).signal.dispatchEvent(new Event('abort'))
    expect((await second).status).toBe(200)
  })

  it('le secret de développement est retiré de l’environnement au démarrage', () => {
    const env: Record<string, string | undefined> = { RUNNER_DEV_SECRET: SECRET, PATH: '/usr/bin' }
    expect(takeDevSecret(env)).toBe(SECRET)
    expect(env).toEqual({ PATH: '/usr/bin' })
    expect(takeDevSecret({})).toBeUndefined()
  })

  it('refuse un secret de développement trop court', () => {
    expect(() => createRunnerHandler({ run: vi.fn(), devSecret: 'court' })).toThrow()
  })

  it('sans secret de développement (Cloud Run, IAM en amont) : aucune vérification d’en-tête', async () => {
    const run = vi.fn(async () => result)
    const handle = createRunnerHandler({ run })
    const res = await handle(new Request('http://service.invalid/run', { method: 'POST', body: json({ project: 'AAAA', base }) }))
    expect(res.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('démarrage : jamais sans protection hors de Cloud Run', () => {
    expect(startupProblem({}, undefined)).toMatch(/RUNNER_DEV_SECRET est obligatoire/)
    expect(startupProblem({ K_SERVICE: 'correction-runner' }, undefined)).toBeNull()
    expect(startupProblem({}, SECRET)).toBeNull()
    expect(startupProblem({ K_SERVICE: 'correction-runner' }, 'court')).toMatch(/trop court/)
  })
})
