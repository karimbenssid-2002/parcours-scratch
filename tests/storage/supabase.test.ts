import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteStored, deleteStoredPrefix, listStoredFolders, readStored, signedUploadUrl, storedSize, writeStored } from '@/lib/storage/files'
import { isNotFound, setBucketForTests, type BucketClient } from '@/lib/storage/supabase'

function fakeBucket(over: Partial<BucketClient> = {}): BucketClient {
  return {
    upload: vi.fn(async () => ({ data: { path: 'x' }, error: null })),
    info: vi.fn(async () => ({ data: { size: 3 }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    list: vi.fn(async () => ({ data: [], error: null })),
    createSignedUploadUrl: vi.fn(async (p: string) => ({
      data: { signedUrl: `https://sb.test/${p}?token=tk`, token: 'tk', path: p },
      error: null,
    })),
    ...over,
  }
}

afterEach(() => {
  setBucketForTests(null)
  delete process.env.STORAGE_BACKEND
})

describe('stockage Supabase', () => {
  it('refuse les chemins qui sortent du bucket', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(fakeBucket())
    await expect(readStored('../secret')).rejects.toThrow('Chemin de stockage invalide')
    await expect(readStored('a/../../b')).rejects.toThrow('Chemin de stockage invalide')
    await expect(writeStored('/etc/x', new Uint8Array())).rejects.toThrow('Chemin de stockage invalide')
    await expect(deleteStored('\\x')).rejects.toThrow('Chemin de stockage invalide')
    await expect(signedUploadUrl('../x')).rejects.toThrow('Chemin de stockage invalide')
  })

  it('readStored renvoie null pour un objet absent', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(
      fakeBucket({
        download: vi.fn(async () => ({
          data: null,
          error: Object.assign(new Error('Object not found'), { status: 400, statusCode: '404' }),
        })),
      }),
    )
    expect(await readStored('projets/1/a.sb3')).toBeNull()
  })

  it('readStored échoue si le bucket est absent (SUPABASE_BUCKET mal réglé), au lieu de renvoyer null', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    for (const error of [
      Object.assign(new Error('Bucket not found'), { status: 400, statusCode: '404' }),
      Object.assign(new Error('The specified bucket does not exist'), { status: 404, statusCode: '404', code: 'NoSuchBucket' }),
    ]) {
      setBucketForTests(fakeBucket({ download: vi.fn(async () => ({ data: null, error })) }))
      await expect(readStored('projets/1/a.sb3')).rejects.toThrow(error.message)
    }
  })

  it('isNotFound : objet absent seulement', () => {
    expect(isNotFound({ status: 400, statusCode: '404', message: 'Object not found' })).toBe(true)
    expect(isNotFound({ status: 404, message: 'Not Found' })).toBe(true)
    expect(isNotFound({ status: 400, statusCode: '404', message: 'Bucket not found' })).toBe(false)
    expect(isNotFound({ status: 404, statusCode: '404', message: 'x', code: 'NoSuchBucket' })).toBe(false)
    expect(isNotFound({ status: 500, statusCode: '500', message: 'boom' })).toBe(false)
  })

  it('readStored renvoie les octets et propage les autres erreurs', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(fakeBucket())
    expect([...(await readStored('a.sb3'))!]).toEqual([1, 2, 3])
    setBucketForTests(
      fakeBucket({
        download: vi.fn(async () => ({
          data: null,
          error: Object.assign(new Error('boom'), { status: 500, statusCode: '500' }),
        })),
      }),
    )
    await expect(readStored('a.sb3')).rejects.toThrow('boom')
  })

  it('writeStored envoie avec upsert: true', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const b = fakeBucket()
    setBucketForTests(b)
    await writeStored('projets/1/a.sb3', new Uint8Array([9]))
    expect(b.upload).toHaveBeenCalledWith('projets/1/a.sb3', expect.anything(), expect.objectContaining({ upsert: true }))
  })

  it('writeStored lève si Supabase renvoie une erreur', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(fakeBucket({ upload: vi.fn(async () => ({ data: null, error: new Error('plein') })) }))
    await expect(writeStored('a', new Uint8Array())).rejects.toThrow('plein')
  })

  it('deleteStored supprime l’objet', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const b = fakeBucket()
    setBucketForTests(b)
    await deleteStored('projets/1/a.sb3')
    expect(b.remove).toHaveBeenCalledWith(['projets/1/a.sb3'])
  })

  it('signedUploadUrl renvoie url et token (sans upsert), null en local', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const b = fakeBucket()
    setBucketForTests(b)
    expect(await signedUploadUrl('p/a.sb3')).toEqual({ url: 'https://sb.test/p/a.sb3?token=tk', token: 'tk' })
    expect(b.createSignedUploadUrl).toHaveBeenCalledWith('p/a.sb3', { upsert: false })
    delete process.env.STORAGE_BACKEND
    expect(await signedUploadUrl('p/a.sb3')).toBeNull()
  })

  it('storedSize lit la taille dans les métadonnées, sans télécharger ; null si absent ; undefined si inconnue', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const b = fakeBucket()
    setBucketForTests(b)
    expect(await storedSize('p/a.sb3')).toBe(3)
    expect(b.info).toHaveBeenCalledWith('p/a.sb3')
    expect(b.download).not.toHaveBeenCalled()
    setBucketForTests(fakeBucket({ info: vi.fn(async () => ({ data: null, error: Object.assign(new Error('Object not found'), { status: 400, statusCode: '404' }) })) }))
    expect(await storedSize('p/a.sb3')).toBeNull()
    setBucketForTests(fakeBucket({ info: vi.fn(async () => ({ data: {}, error: null })) }))
    expect(await storedSize('p/a.sb3')).toBeUndefined()
    setBucketForTests(fakeBucket({ info: vi.fn(async () => ({ data: null, error: Object.assign(new Error('boom'), { status: 500, statusCode: '500' }) })) }))
    await expect(storedSize('p/a.sb3')).rejects.toThrow('boom')
    await expect(storedSize('../x')).rejects.toThrow('Chemin de stockage invalide')
  })

  it('storedSize en local : taille du fichier, null si absent', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taille-'))
    process.env.STORAGE_DIR = dir
    try {
      await writeStored('p/a.sb3', new Uint8Array([1, 2, 3, 4]))
      expect(await storedSize('p/a.sb3')).toBe(4)
      expect(await storedSize('p/b.sb3')).toBeNull()
    } finally {
      delete process.env.STORAGE_DIR
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  const dossier = (name: string) => ({ name, id: null })
  const fichier = (name: string) => ({ name, id: `id-${name}` })

  it('deleteStoredPrefix parcourt deux niveaux, page par page, et supprime par lots', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const list = vi.fn(async (p: string, o: { limit: number; offset: number }) => {
      if (p === 'projets') return { data: [dossier('s1'), dossier('s2')], error: null }
      if (p === 'projets/s1') return { data: o.offset === 0 ? [fichier('a.sb3')] : [], error: null }
      if (p === 'projets/s2') return { data: o.offset === 0 ? [fichier('b.sb3')] : [], error: null }
      return { data: [], error: null }
    })
    const b = fakeBucket({ list })
    setBucketForTests(b)
    expect(await deleteStoredPrefix('projets/')).toEqual({ deleted: 2, complete: true })
    expect(list).toHaveBeenCalledWith('projets', { limit: 100, offset: 0 })
    expect(b.remove).toHaveBeenCalledTimes(1)
    expect(b.remove).toHaveBeenCalledWith(['projets/s1/a.sb3', 'projets/s2/b.sb3'])
  })

  /** Faux bucket à état : `remove` retire vraiment les fichiers (chemins complets), `list` reflète l'état courant. */
  function bucketAvecEtat(chemins: string[], onRemove?: () => void) {
    const etat = new Set(chemins)
    const list = vi.fn(async (dir: string, o: { limit: number; offset: number }) => {
      const entrees = new Map<string, string | null>()
      for (const c of etat) {
        if (!c.startsWith(`${dir}/`)) continue
        const [nom, ...reste] = c.slice(dir.length + 1).split('/')
        entrees.set(nom, reste.length ? null : `id-${nom}`)
      }
      const data = [...entrees].slice(o.offset, o.offset + o.limit).map(([name, id]) => ({ name, id }))
      return { data, error: null }
    })
    const remove = vi.fn(async (ps: string[]) => {
      ps.forEach((p) => etat.delete(p))
      onRemove?.()
      return { data: [], error: null }
    })
    return { etat, list, remove, bucket: fakeBucket({ list, remove }) }
  }

  it('deleteStoredPrefix : plus de 100 fichiers, tous effacés malgré la pagination', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const noms = Array.from({ length: 230 }, (_, i) => `projets/s1/f${i}.sb3`)
    const f = bucketAvecEtat(noms)
    setBucketForTests(f.bucket)
    expect(await deleteStoredPrefix('projets/s1/')).toEqual({ deleted: 230, complete: true })
    expect(f.etat.size).toBe(0)
    expect(f.list.mock.calls.map((c) => c[1].offset)).toEqual([0, 100, 200])
    for (const c of f.remove.mock.calls) expect(c[0].length).toBeLessThanOrEqual(100)
  })

  it('deleteStoredPrefix : échéance dépassée en cours de route, puis reprise qui termine', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const noms = [
      ...Array.from({ length: 150 }, (_, i) => `projets/s1/f${i}.sb3`),
      ...Array.from({ length: 100 }, (_, i) => `projets/s2/f${i}.sb3`),
    ]
    let echu = false
    const f = bucketAvecEtat(noms, () => {
      echu = true
    })
    // L'échéance n'expire qu'après la première suppression.
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (echu ? 2000 : 0))
    setBucketForTests(f.bucket)
    const partiel = await deleteStoredPrefix('projets/', { deadlineMs: 1000 })
    now.mockRestore()
    expect(partiel.complete).toBe(false)
    expect(partiel.deleted).toBeGreaterThan(0)
    expect(f.etat.size).toBe(250 - partiel.deleted)
    expect(f.etat.size).toBeGreaterThan(0)
    expect(await deleteStoredPrefix('projets/')).toEqual({ deleted: 250 - partiel.deleted, complete: true })
    expect(f.etat.size).toBe(0)
  })

  it('deleteStoredPrefix : une erreur de list ou de remove est levée', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(fakeBucket({ list: vi.fn(async () => ({ data: null, error: new Error('list KO') })) }))
    await expect(deleteStoredPrefix('projets/s1/')).rejects.toThrow('list KO')
    setBucketForTests(
      fakeBucket({
        list: vi.fn(async () => ({ data: [fichier('a.sb3')], error: null })),
        remove: vi.fn(async () => ({ data: null, error: new Error('remove KO') })),
      }),
    )
    await expect(deleteStoredPrefix('projets/s1/')).rejects.toThrow('remove KO')
  })

  it('listStoredFolders : dossiers du premier niveau, toutes les pages, sans les fichiers', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    const noms = [
      ...Array.from({ length: 130 }, (_, i) => `projets/s${i}/a.sb3`),
      'projets/s0/b.sb3',
      'projets/isole.sb3',
      'starters/x.sb3',
    ]
    const f = bucketAvecEtat(noms)
    setBucketForTests(f.bucket)
    const dossiers = await listStoredFolders('projets/')
    expect(dossiers).toHaveLength(130)
    expect(new Set(dossiers)).toEqual(new Set(Array.from({ length: 130 }, (_, i) => `s${i}`)))
    expect(f.list.mock.calls.map((c) => [c[0], c[1].offset])).toEqual([['projets', 0], ['projets', 100]])
    expect(f.remove).not.toHaveBeenCalled()
  })

  it('listStoredFolders : une erreur de list est levée', async () => {
    process.env.STORAGE_BACKEND = 'supabase'
    setBucketForTests(fakeBucket({ list: vi.fn(async () => ({ data: null, error: new Error('list KO') })) }))
    await expect(listStoredFolders('projets/')).rejects.toThrow('list KO')
  })
})
