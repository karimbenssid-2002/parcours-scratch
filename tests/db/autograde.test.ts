import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createActivity } from '@/lib/db/activities'
import { saveSolution } from '@/lib/activities/solution'
import { autogradeModel, getAutogradeConfig, getAutogradeDraft, isAutogradeReady, readyActivityIds, saveAutogradeSettings, setSetting, setSolution } from '@/lib/db/autograde'

describe('préparation de la correction automatique', () => {
  it('prête seulement avec une solution et au moins un critère', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'Le serpent' })
    expect(await isAutogradeReady(db, id)).toBe(false)
    expect(await saveAutogradeSettings(db, id, { criteria: ['Le lutin dessine un carré'], answers: [], keys: [], durationMs: 10_000 })).toEqual({ ok: true })
    expect(await isAutogradeReady(db, id)).toBe(false) // pas encore de solution
    await setSolution(db, id, `solutions/${id}.sb3`, 'sb3')
    expect(await isAutogradeReady(db, id)).toBe(true)
    expect([...(await readyActivityIds(db))]).toEqual([id])
    expect(await getAutogradeConfig(db, id)).toMatchObject({ criteria: ['Le lutin dessine un carré'], durationMs: 10_000, solutionFormat: 'sb3' })
  })

  it('valide les réglages', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'A' })
    const ok = { criteria: ['x'], answers: [], keys: [], durationMs: 10_000 }
    expect(await saveAutogradeSettings(db, id, { ...ok, criteria: [] })).toMatchObject({ ok: false })
    expect(await saveAutogradeSettings(db, id, { ...ok, criteria: Array(9).fill('c') })).toMatchObject({ ok: false })
    expect(await saveAutogradeSettings(db, id, { ...ok, criteria: ['x'.repeat(800)] })).toMatchObject({ ok: true })
    expect(await saveAutogradeSettings(db, id, { ...ok, criteria: ['x'.repeat(801)] })).toMatchObject({ ok: false })
    expect(await saveAutogradeSettings(db, id, { ...ok, durationMs: 1000 })).toMatchObject({ ok: false })
    expect(await saveAutogradeSettings(db, id, { ...ok, keys: [{ key: 'flèche', times: 2 }] })).toMatchObject({ ok: false })
  })

  it('modèle : Haiku par défaut, Sonnet si choisi, valeur inconnue ignorée', async () => {
    const db = await testDb()
    expect(await autogradeModel(db)).toBe('claude-haiku-5-5')
    await setSetting(db, 'autograde_model', 'claude-sonnet-5-5')
    expect(await autogradeModel(db)).toBe('claude-sonnet-5-5')
    await setSetting(db, 'autograde_model', 'autre')
    expect(await autogradeModel(db)).toBe('claude-haiku-5-5')
    await setSetting(db, 'autograde_model', 'claude-haiku-4-5') // ancien réglage enregistré
    expect(await autogradeModel(db)).toBe('claude-haiku-5-5')
  })
})

describe('solution de référence', () => {
  beforeEach(() => { process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-')) })

  it('accepte un .sb2, refuse un fichier non Scratch et une activité inconnue', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'Le serpent' })
    const sb2 = new Uint8Array(fs.readFileSync('tests/fixtures/le-serpent.sb2'))
    expect(await saveSolution(db, id, sb2)).toEqual({ ok: true, format: 'sb2' })
    expect(await saveSolution(db, id, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false, status: 400 })
    expect(await saveSolution(db, '00000000-0000-4000-8000-000000000000', sb2)).toMatchObject({ ok: false, status: 404 })
    expect((await getAutogradeDraft(db, id))?.hasSolution).toBe(true)
  })
})
