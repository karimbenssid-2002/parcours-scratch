import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteStored, readStored, storagePath, writeStored } from '@/lib/storage/files'

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stockage-'))
})

describe('stockage', () => {
  it('écrit, relit, remplace et supprime un fichier', async () => {
    await writeStored('projets/s1/a1.sb3', new Uint8Array([1, 2, 3]))
    expect([...(await readStored('projets/s1/a1.sb3'))!]).toEqual([1, 2, 3])
    await writeStored('projets/s1/a1.sb3', new Uint8Array([4]))
    expect([...(await readStored('projets/s1/a1.sb3'))!]).toEqual([4])
    await deleteStored('projets/s1/a1.sb3')
    expect(await readStored('projets/s1/a1.sb3')).toBeNull()
  })

  it('renvoie null pour un fichier absent', async () => {
    expect(await readStored('starters/inconnu.sb3')).toBeNull()
  })

  it('refuse tout chemin qui sort du dossier de stockage', () => {
    expect(() => storagePath('../secret.txt')).toThrow()
    expect(() => storagePath('projets/../../secret.txt')).toThrow()
    expect(() => storagePath(path.resolve('/etc/passwd'))).toThrow()
  })
})
