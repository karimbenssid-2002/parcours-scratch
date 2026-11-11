import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { createActivity, getActivityDetail } from '@/lib/db/activities'
import { saveStarter } from '@/lib/activities/starter'
import { readStored } from '@/lib/storage/files'

const sb3 = new Uint8Array(fs.readFileSync('tests/fixtures/defi1-capytale.sb3'))
const sb2 = new Uint8Array(fs.readFileSync('tests/fixtures/le-serpent.sb2'))

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'depart-'))
})

describe('saveStarter', () => {
  it('enregistre un .sb2 puis le remplace par un .sb3 (ancien fichier supprimé)', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'Le serpent' })
    expect(await saveStarter(db, id, sb2, 'upload')).toEqual({ ok: true, format: 'sb2' })
    expect(await readStored(`starters/${id}.sb2`)).not.toBeNull()
    expect(await saveStarter(db, id, sb3, 'capytale')).toEqual({ ok: true, format: 'sb3' })
    expect(await readStored(`starters/${id}.sb2`)).toBeNull()
    expect(await getActivityDetail(db, id)).toMatchObject({ starterProjectPath: `starters/${id}.sb3`, starterSource: 'capytale' })
  })

  it('refuse un fichier qui n’est pas un projet Scratch, ou une activité inconnue', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'X' })
    expect(await saveStarter(db, id, new Uint8Array([1, 2, 3]), 'upload')).toMatchObject({ ok: false, status: 400 })
    expect(await saveStarter(db, '00000000-0000-4000-8000-000000000000', sb3, 'upload')).toMatchObject({ ok: false, status: 404 })
    expect((await getActivityDetail(db, id))?.starterProjectPath).toBeNull()
  })
})
