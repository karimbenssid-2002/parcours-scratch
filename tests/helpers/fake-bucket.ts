import { vi } from 'vitest'
import type { BucketClient } from '@/lib/storage/supabase'

/**
 * Faux bucket Supabase à état (chemins complets), comme dans tests/storage/supabase.test.ts.
 * Avec `panne.on = true`, toute lecture de liste échoue (stockage indisponible).
 */
export function bucketAvecEtat(chemins: string[]) {
  const etat = new Set(chemins)
  const panne = { on: false }
  const list = vi.fn(async (d: string, o: { limit: number; offset: number }) => {
    if (panne.on) return { data: null, error: new Error('stockage indisponible') }
    const entrees = new Map<string, string | null>()
    for (const c of etat) {
      if (!c.startsWith(`${d}/`)) continue
      const [nom, ...reste] = c.slice(d.length + 1).split('/')
      entrees.set(nom, reste.length ? null : `id-${nom}`)
    }
    return { data: [...entrees].slice(o.offset, o.offset + o.limit).map(([name, id]) => ({ name, id })), error: null }
  })
  const remove = vi.fn(async (ps: string[]) => {
    ps.forEach((p) => etat.delete(p))
    return { data: [], error: null }
  })
  const bucket: BucketClient = {
    upload: vi.fn(async () => ({ data: { path: 'x' }, error: null })),
    info: vi.fn(async () => ({ data: { size: 3 }, error: null })),
    download: vi.fn(async () => ({ data: null, error: null })),
    remove,
    list,
    createSignedUploadUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://sb.test/${p}`, token: 'tk', path: p }, error: null })),
  } as unknown as BucketClient
  return { etat, panne, list, remove, bucket }
}
