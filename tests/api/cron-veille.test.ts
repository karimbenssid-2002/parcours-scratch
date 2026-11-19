import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'

const ctx = vi.hoisted(() => ({ db: null as unknown, queued: false }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))
const queue = vi.hoisted(() => ({ recoverStuck: vi.fn(async () => 0), hasQueued: vi.fn(async () => ctx.queued) }))
vi.mock('@/lib/autograde/queue', () => queue)
const launch = vi.hoisted(() => ({ scheduleDrain: vi.fn() }))
vi.mock('@/lib/autograde/launch', () => launch)
const erase = vi.hoisted(() => ({
  annualReset: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ status: 'a-jour', year: 2026 })),
  deleteOrphanFolders: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ deleted: 0, complete: true })),
}))
vi.mock('@/lib/retention/erase', () => erase)

const { GET } = await import('@/app/api/cron/veille/route')

const req = (authorization?: string) =>
  new Request('http://localhost/api/cron/veille', { headers: authorization ? { authorization } : {} })

afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); ctx.queued = false; queue.recoverStuck.mockClear(); launch.scheduleDrain.mockClear()
  erase.annualReset.mockClear(); erase.deleteOrphanFolders.mockClear()
})

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

  it('appelle la remise à zéro avec l’heure courante', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    const db = await testDb()
    ctx.db = db
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const avant = Date.now()
    erase.annualReset.mockResolvedValueOnce({ status: 'partiel', year: 2027, students: 12, classes: 3, files: 40 })
    const res = await GET(req('Bearer secret-de-test-0123456789'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(erase.annualReset).toHaveBeenCalledTimes(1)
    const [dbArg, nowMs, opts] = erase.annualReset.mock.calls[0] as [unknown, number, { deadlineMs: number }]
    expect(dbArg).toBe(db)
    expect(nowMs).toBeGreaterThanOrEqual(avant)
    expect(nowMs).toBeLessThanOrEqual(Date.now())
    // 120 s : la file de correction, lancée après la réponse, garde au moins 30 s pour prendre des copies (150 s).
    expect(opts.deadlineMs - avant).toBeGreaterThanOrEqual(120_000)
    expect(opts.deadlineMs - avant).toBeLessThan(125_000)
    expect(log).toHaveBeenCalledWith('[remise à zéro] année 2027 : 12 élèves, 3 classes, 40 fichiers (à reprendre)')

    log.mockClear()
    erase.annualReset.mockResolvedValueOnce({ status: 'fait', year: 2027, students: 0, classes: 0, files: 5 })
    await GET(req('Bearer secret-de-test-0123456789'))
    expect(log).toHaveBeenCalledWith('[remise à zéro] année 2027 : 0 élèves, 0 classes, 5 fichiers')

    log.mockClear()
    await GET(req('Bearer secret-de-test-0123456789')) // « a-jour » : aucune ligne
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[remise à zéro]'))).toHaveLength(0)

    log.mockClear()
    erase.annualReset.mockResolvedValueOnce({ status: 'initialise', year: 2026 })
    const res2 = await GET(req('Bearer secret-de-test-0123456789'))
    expect(await res2.json()).toEqual({ ok: true })
    expect(log).toHaveBeenCalledWith('[remise à zéro] repère initialisé à 2026')
  })

  it('une erreur de remise à zéro n’empêche pas la réponse 200', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    ctx.db = await testDb()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    erase.annualReset.mockRejectedValueOnce(new Error('relation introuvable pour alice.exemple@malraux-rabat.org'))
    const res = await GET(req('Bearer secret-de-test-0123456789'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(queue.recoverStuck).toHaveBeenCalledTimes(1) // la suite de la tâche continue
    expect(error).toHaveBeenCalledTimes(1)
    const ligne = String(error.mock.calls[0][0])
    expect(ligne).toMatch(/^\[remise à zéro\] échec : /)
    expect(ligne).not.toContain('@')
  })

  it('chaque jour après la remise à zéro : efface les dossiers orphelins, avec la même échéance', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    const db = await testDb()
    ctx.db = db
    const ordre: string[] = []
    erase.annualReset.mockImplementationOnce(async () => { ordre.push('remise'); return { status: 'a-jour', year: 2026 } })
    erase.deleteOrphanFolders.mockImplementationOnce(async () => { ordre.push('orphelins'); return { deleted: 0, complete: true } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await GET(req('Bearer secret-de-test-0123456789'))).status).toBe(200)
    expect(ordre).toEqual(['remise', 'orphelins'])
    const [, , resetOpts] = erase.annualReset.mock.calls[0] as [unknown, number, { deadlineMs: number }]
    const [dbArg, opts] = erase.deleteOrphanFolders.mock.calls[0] as [unknown, { deadlineMs: number }]
    expect(dbArg).toBe(db)
    expect(opts.deadlineMs).toBe(resetOpts.deadlineMs)
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[dossiers orphelins]'))).toHaveLength(0) // rien effacé : aucune ligne

    erase.annualReset.mockResolvedValueOnce({ status: 'initialise', year: 2026 })
    erase.deleteOrphanFolders.mockResolvedValueOnce({ deleted: 4, complete: true })
    await GET(req('Bearer secret-de-test-0123456789'))
    expect(log).toHaveBeenCalledWith('[dossiers orphelins] 4 fichiers effacés')

    erase.annualReset.mockResolvedValueOnce({ status: 'fait', year: 2027, students: 0, classes: 0, files: 2 })
    erase.deleteOrphanFolders.mockResolvedValueOnce({ deleted: 0, complete: false })
    await GET(req('Bearer secret-de-test-0123456789'))
    expect(log).toHaveBeenCalledWith('[dossiers orphelins] 0 fichiers effacés (à reprendre)')
    expect(erase.deleteOrphanFolders).toHaveBeenCalledTimes(3)
  })

  it('pas de passage des orphelins pendant une remise à zéro inachevée ni après son échec', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    ctx.db = await testDb()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    erase.annualReset.mockResolvedValueOnce({ status: 'partiel', year: 2027, students: 12, classes: 3, files: 40 })
    await GET(req('Bearer secret-de-test-0123456789'))
    erase.annualReset.mockRejectedValueOnce(new Error('stockage indisponible'))
    await GET(req('Bearer secret-de-test-0123456789'))
    expect(erase.deleteOrphanFolders).not.toHaveBeenCalled()
  })

  it('une erreur du passage des orphelins est journalisée sans adresse, la tâche continue', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-0123456789')
    ctx.db = await testDb()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    erase.deleteOrphanFolders.mockRejectedValueOnce(new Error('liste refusée pour alice.exemple@malraux-rabat.org'))
    const res = await GET(req('Bearer secret-de-test-0123456789'))
    expect(res.status).toBe(200)
    expect(queue.recoverStuck).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    const ligne = String(error.mock.calls[0][0])
    expect(ligne).toMatch(/^\[dossiers orphelins\] échec : /)
    expect(ligne).not.toContain('@')
  })
})
