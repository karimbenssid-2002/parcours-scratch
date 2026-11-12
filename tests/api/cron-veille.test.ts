import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'

const ctx = vi.hoisted(() => ({ db: null as unknown, queued: false }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))
const queue = vi.hoisted(() => ({ recoverStuck: vi.fn(async () => 0), hasQueued: vi.fn(async () => ctx.queued) }))
vi.mock('@/lib/autograde/queue', () => queue)
const launch = vi.hoisted(() => ({ scheduleDrain: vi.fn() }))
vi.mock('@/lib/autograde/launch', () => launch)

const { GET } = await import('@/app/api/cron/veille/route')

const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/veille', { headers: authorization ? { authorization } : {} })

afterEach(() => { vi.unstubAllEnvs(); ctx.queued = false; queue.recoverStuck.mockClear(); launch.scheduleDrain.mockClear() })

describe('tâche planifiée « veille » (base gardée active)', () => {
  it('404 sans CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(req('Bearer x'))).status).toBe(404)
  })

  it('401 sans en-tête ou avec un mauvais secret', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    ctx.db = await testDb()
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer mauvais'))).status).toBe(401)
    expect((await GET(req('secret-de-test-0123456789'))).status).toBe(401)
  })

  it('200 { ok: true } avec le bon secret, après une requête à la base', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    const db = await testDb()
    const execute = vi.spyOn(db, 'execute')
    ctx.db = db
    const res = await GET(req('Bearer secret-de-test-0123456789'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('reprend les corrections bloquées, puis relance la file s’il reste des copies en attente', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    ctx.db = await testDb()
    expect((await GET(req('Bearer secret-de-test-0123456789'))).status).toBe(200)
    expect(queue.recoverStuck).toHaveBeenCalledTimes(1)
    expect(launch.scheduleDrain).not.toHaveBeenCalled() // rien en file
    ctx.queued = true
    expect((await GET(req('Bearer secret-de-test-0123456789'))).status).toBe(200)
    expect(launch.scheduleDrain).toHaveBeenCalledTimes(1)
    const [startedAt, headers] = launch.scheduleDrain.mock.calls[0] as unknown as [number, Headers]
    expect(Math.abs(Date.now() - startedAt)).toBeLessThan(5_000) // échéance comptée depuis le début de l'appel
    expect(headers).toBeInstanceOf(Headers)
  })

  it('correction désactivée : ni reprise ni relance', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    vi.stubEnv('AUTOGRADE_ENABLED', '')
    ctx.db = await testDb()
    ctx.queued = true
    expect((await GET(req('Bearer secret-de-test-0123456789'))).status).toBe(200)
    expect(queue.recoverStuck).not.toHaveBeenCalled()
    expect(launch.scheduleDrain).not.toHaveBeenCalled()
  })
})
