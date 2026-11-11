import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'

const ctx = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))

const { GET } = await import('@/app/api/cron/veille/route')

const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/veille', { headers: authorization ? { authorization } : {} })

afterEach(() => vi.unstubAllEnvs())

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
})
