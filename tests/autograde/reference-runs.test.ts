import { describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { autogradeReferenceRuns, autogradeRunnerCalls } from '@/lib/db/schema'
import { recordRunnerCall, referenceRun, timedRun } from '@/lib/db/autograde-runs'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'

const base = { answers: ['Zoé'], keys: [], durationMs: 5000 }
const trace = (over: Partial<RunTrace> = {}): RunTrace => ({
  finished: true, timedOut: false, error: null, says: [], questions: [], variables: {}, lists: {}, sprites: [],
  costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' }, ...over,
})
const ok: RunResult = { project: { targets: [] }, traces: [trace()] }

function counter(result: RunResult | (() => Promise<RunResult>) = ok) {
  const calls: { bytes: Uint8Array; seeds?: number[] }[] = []
  return { calls, runner: 'remote' as const, run: async (bytes: Uint8Array, _b: unknown, seeds?: number[]) => { calls.push({ bytes, seeds }); return typeof result === 'function' ? result() : result } }
}

describe('relevés de référence en base', () => {
  it('deux corrections de la même activité : une seule exécution', async () => {
    const db = await testDb()
    const d = counter()
    const bytes = Buffer.from('solution')
    const a = await referenceRun(db, d, bytes, base)
    const b = await referenceRun(db, d, Buffer.from('solution'), base)
    expect(d.calls).toHaveLength(1)
    expect(b).toEqual(a)
    expect(await db.select().from(autogradeReferenceRuns)).toHaveLength(1)
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(1)
  })

  it('ne garde pas les octets du projet, seulement le relevé', async () => {
    const db = await testDb()
    await referenceRun(db, counter(), Buffer.from('contenu-secret-du-projet'), base)
    const [row] = await db.select().from(autogradeReferenceRuns)
    expect(JSON.stringify(row)).not.toContain('contenu-secret')
    expect(row.key).toMatch(/^[0-9a-f]{64}\|/)
  })

  it('une exécution ratée n’est pas gardée mais est comptée', async () => {
    const db = await testDb()
    for (const bad of [
      { project: null, traces: [trace()] },
      { project: {}, traces: [trace({ error: 'boom' })] },
      { project: {}, traces: [trace({ cut: true })] },
    ] satisfies RunResult[]) {
      const d = counter(bad)
      await referenceRun(db, d, Buffer.from('x'), base)
      await referenceRun(db, d, Buffer.from('x'), base)
      expect(d.calls).toHaveLength(2)
    }
    expect(await db.select().from(autogradeReferenceRuns)).toHaveLength(0)
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(6)
  })

  it('autres octets, autres réglages ou autres graines : nouvelle exécution', async () => {
    const db = await testDb()
    const d = counter()
    await referenceRun(db, d, Buffer.from('a'), base)
    await referenceRun(db, d, Buffer.from('b'), base)
    await referenceRun(db, d, Buffer.from('a'), { ...base, durationMs: 6000 })
    await referenceRun(db, d, Buffer.from('a'), base, [1])
    await referenceRun(db, d, Buffer.from('a'), base, [1])
    expect(d.calls).toHaveLength(4)
    expect(d.calls[3].seeds).toEqual([1])
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(4)
  })

  it('10 copies qui demandent le même relevé en même temps : une seule exécution, le même relevé pour toutes', async () => {
    const db = await testDb()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const d = counter(async () => { await gate; return ok })
    const all = Promise.all(Array.from({ length: 10 }, () => referenceRun(db, d, Buffer.from('solution-rafale'), base)))
    await new Promise((r) => setTimeout(r, 50))
    release()
    const results = await all
    expect(d.calls).toHaveLength(1)
    for (const r of results) expect(r).toEqual(ok)
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(1)
  })

  it('exécution partagée qui échoue : l’échec n’est pas gardé, l’appel suivant relance', async () => {
    const db = await testDb()
    let fail = true
    const d = counter(async () => { if (fail) throw new Error('boum'); return ok })
    const burst = await Promise.allSettled(Array.from({ length: 3 }, () => referenceRun(db, d, Buffer.from('solution-echec'), base)))
    expect(burst.every((r) => r.status === 'rejected')).toBe(true)
    expect(d.calls).toHaveLength(1)
    fail = false
    expect(await referenceRun(db, d, Buffer.from('solution-echec'), base)).toEqual(ok)
    expect(d.calls).toHaveLength(2)
  })

  it('deux corrections simultanées : pas d’erreur, un seul relevé gardé', async () => {
    const db = await testDb()
    const d = counter()
    await Promise.all([referenceRun(db, d, Buffer.from('s'), base), referenceRun(db, d, Buffer.from('s'), base)])
    expect(await db.select().from(autogradeReferenceRuns)).toHaveLength(1)
  })
})

describe('appels au service d’exécution', () => {
  it('enregistre le genre, la durée et le travail', async () => {
    const db = await testDb()
    await recordRunnerCall(db, { jobId: null, durationMs: 12.6, kind: 'eleve' })
    const [row] = await db.select().from(autogradeRunnerCalls).where(eq(autogradeRunnerCalls.kind, 'eleve'))
    expect(row).toMatchObject({ jobId: null, durationMs: 13, kind: 'eleve' })
    expect(Date.parse(row.at)).not.toBeNaN()
  })

  it('compte une erreur arrivée au service, pas une erreur de configuration', async () => {
    const db = await testDb()
    const reached = { runner: 'remote' as const, run: async () => { throw Object.assign(new Error('service'), { reachedService: true }) } }
    const config = { runner: 'remote' as const, run: async () => { throw new Error('configuration') } }
    await expect(timedRun(db, reached, 'eleve', null, new Uint8Array(), base)).rejects.toThrow('service')
    await expect(timedRun(db, config, 'eleve', null, new Uint8Array(), base)).rejects.toThrow('configuration')
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(1)
  })
})

describe('exécuteur local et écritures non bloquantes', () => {
  it('exécuteur local (Chromium) : aucun appel enregistré, relevé gardé quand même', async () => {
    const db = await testDb()
    const d = { ...counter(), runner: 'local' as const }
    await referenceRun(db, d, Buffer.from('s'), base)
    await timedRun(db, d, 'eleve', null, new Uint8Array(), base)
    await referenceRun(db, { ...d, runner: 'local' }, Buffer.from('t'), base)
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(0)
    expect(await db.select().from(autogradeReferenceRuns)).toHaveLength(2)
  })

  it('l’échec de l’écriture de l’appel ne fait pas perdre le résultat', async () => {
    const db = await testDb()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new Proxy(db, { get: (t, k, r) => (k === 'insert' ? (tbl: unknown) => { if (tbl === autogradeRunnerCalls) throw new Error('secret-projet'); return t.insert(tbl as never) } : Reflect.get(t, k, r)) })
    expect(await timedRun(broken, counter(), 'eleve', null, new Uint8Array(), base)).toEqual(ok)
    expect(await referenceRun(broken, counter(), Buffer.from('z'), base)).toEqual(ok)
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-projet')
    log.mockRestore()
  })

  it('l’échec de l’écriture du relevé ne fait pas perdre le résultat', async () => {
    const db = await testDb()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new Proxy(db, { get: (t, k, r) => (k === 'insert' ? (tbl: unknown) => { if (tbl === autogradeReferenceRuns) throw new Error('boum'); return t.insert(tbl as never) } : Reflect.get(t, k, r)) })
    expect(await referenceRun(broken, counter(), Buffer.from('y'), base)).toEqual(ok)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
