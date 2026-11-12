import type { AddressInfo } from 'node:net'
import type http from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRunnerHandler, MAX_BODY_BYTES } from '@/runner-service/handler'
import { createHttpServer } from '@/runner-service/http'
import { fixedToken, remoteRun, RunnerError } from '@/lib/autograde/runner/remote'
import type { RunResult } from '@/lib/autograde/runner/types'

const SECRET = 'secret-de-test-inventé-0123456789abcdef'
const base = { answers: [], keys: [], durationMs: 3000 }
const result: RunResult = { project: { targets: [] }, traces: [] }
let mode: 'ok' | 'hang' = 'ok'
let lastSignal: AbortSignal | undefined
const run = vi.fn((_b: Uint8Array, _base: unknown, _s?: number[], control?: { signal?: AbortSignal }) => {
  lastSignal = control?.signal
  if (mode === 'ok') return Promise.resolve(result)
  return new Promise<RunResult>((resolve) => control?.signal?.addEventListener('abort', () => resolve(result), { once: true }))
})
let server: http.Server
let url = ''

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  server = createHttpServer(createRunnerHandler({ run, devSecret: SECRET }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const auth = { authorization: `Bearer ${SECRET}` }

describe('service d’exécution en HTTP réel', { timeout: 60_000 }, () => {
  it('santé, 401, et une exécution aller-retour', async () => {
    expect(await (await fetch(`${url}/`)).text()).toBe('ok')
    expect((await fetch(`${url}/run`, { method: 'POST', body: '{}' })).status).toBe(401)
    const r = await remoteRun(url, fixedToken(SECRET))(new Uint8Array([1, 2, 3]), base)
    expect(r).toEqual(result)
  })

  it('corps trop gros annoncé : vraie réponse 413, pas de connexion coupée', async () => {
    const res = await fetch(`${url}/run`, { method: 'POST', headers: auth, body: new Uint8Array(MAX_BODY_BYTES + 1024 * 1024) })
    expect(res.status).toBe(413)
  })

  it('corps trop gros envoyé par morceaux (sans longueur annoncée) : vraie réponse 413', async () => {
    let sent = 0
    const chunk = new Uint8Array(1024 * 1024)
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (sent > MAX_BODY_BYTES + 4 * chunk.byteLength) return c.close(); sent += chunk.byteLength; c.enqueue(chunk) } })
    const res = await fetch(`${url}/run`, { method: 'POST', headers: auth, body, duplex: 'half' } as RequestInit)
    expect(res.status).toBe(413)
    // La connexion reste utilisable : requête suivante normale.
    expect((await fetch(`${url}/`)).status).toBe(200)
  })

  it('projet trop gros par le client du site : RunnerError 413, sans nouvel essai', async () => {
    const fetchSpy = vi.fn((...a: Parameters<typeof fetch>) => fetch(...a))
    const e = await remoteRun(url, fixedToken(SECRET), { fetch: fetchSpy })(new Uint8Array(20 * 1024 * 1024 + 1), base).catch((x) => x)
    expect(e).toBeInstanceOf(RunnerError)
    expect(e.status).toBe(413)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('client parti pendant l’exécution : exécution arrêtée et instance libérée', async () => {
    mode = 'hang'
    lastSignal = undefined
    const client = new AbortController()
    const pending = fetch(`${url}/run`, { method: 'POST', headers: auth, body: JSON.stringify({ project: 'AAAA', base }), signal: client.signal }).catch(() => null)
    await vi.waitFor(() => expect(lastSignal).toBeDefined())
    client.abort()
    await pending
    await vi.waitFor(() => expect(lastSignal?.aborted).toBe(true))
    mode = 'ok'
    const res = await fetch(`${url}/run`, { method: 'POST', headers: auth, body: JSON.stringify({ project: 'AAAA', base }) })
    expect(res.status).toBe(200)
  })
})
