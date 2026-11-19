import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteStored, deleteStoredPrefix, listStoredFolders, readStored, storagePath, writeStored } from '@/lib/storage/files'

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

  it('efface tout un dossier et compte les fichiers', async () => {
    await writeStored('projets/s1/a.sb3', new Uint8Array([1]))
    await writeStored('projets/s1/b.sb3', new Uint8Array([2]))
    await writeStored('projets/s2/c.sb3', new Uint8Array([3]))
    expect(await deleteStoredPrefix('projets/s1/')).toEqual({ deleted: 2, complete: true })
    expect(await readStored('projets/s1/a.sb3')).toBeNull()
    expect(await readStored('projets/s2/c.sb3')).not.toBeNull()
  })

  it('dossier absent : 0 fichier, complet', async () => {
    expect(await deleteStoredPrefix('projets/inconnu/')).toEqual({ deleted: 0, complete: true })
  })

  it('refuse un préfixe sans / final ou qui sort du stockage', async () => {
    await expect(deleteStoredPrefix('projets')).rejects.toThrow()
    await expect(deleteStoredPrefix('../x/')).rejects.toThrow()
  })

  it('liste les dossiers du premier niveau (pas les fichiers), vide si absent', async () => {
    await writeStored('projets/s1/a.sb3', new Uint8Array([1]))
    await writeStored('projets/s2/sous/b.sb3', new Uint8Array([2]))
    await writeStored('projets/isole.sb3', new Uint8Array([3]))
    expect((await listStoredFolders('projets/')).sort()).toEqual(['s1', 's2'])
    expect(await listStoredFolders('inconnu/')).toEqual([])
    await expect(listStoredFolders('projets')).rejects.toThrow()
    await expect(listStoredFolders('../x/')).rejects.toThrow()
  })
})
