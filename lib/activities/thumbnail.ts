import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import type { DB } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { readBodyLimited } from '@/lib/http/body'
import { deleteStored, writeStored } from '@/lib/storage/files'

export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
const MAX_WIDTH = 800
const FETCH_TIMEOUT_MS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** URL publique d'une vignette envoyée : /api/vignettes/<activité>-<horodatage>.webp (nouveau nom à chaque envoi). */
const PUBLIC = /^\/api\/vignettes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.webp)$/i

type Processed = { ok: true; webp: Uint8Array } | { ok: false; error: string }

const TOO_LARGE = 'L’image dépasse 2 Mo.'
const NOT_IMAGE = 'Ce fichier n’est pas une image PNG, JPEG, WebP ou GIF.'

/** Signatures des formats acceptés : le contenu fait foi, pas l'extension. */
function isAcceptedImage(b: Uint8Array): boolean {
  const ascii = (from: number, to: number) => Buffer.from(b.subarray(from, to)).toString('latin1')
  return (b[0] === 0x89 && ascii(1, 4) === 'PNG')
    || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    || (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    || ascii(0, 4) === 'GIF8'
}

/** Vérifie l'image et la normalise : WebP, 800 px de large au plus, orientation appliquée, métadonnées retirées. */
export async function processThumbnail(bytes: Uint8Array): Promise<Processed> {
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) return { ok: false, error: TOO_LARGE }
  if (!isAcceptedImage(bytes)) return { ok: false, error: NOT_IMAGE }
  try {
    const webp = await sharp(bytes, { limitInputPixels: 40_000_000 }) // première image seulement pour un GIF animé
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    return { ok: true, webp: new Uint8Array(webp) }
  } catch {
    return { ok: false, error: 'Cette image est illisible ou endommagée.' }
  }
}

// --- Téléchargement depuis une adresse (protégé contre les requêtes vers le réseau interne : SSRF) ---

type Address = { address: string; family: 4 | 6 }
export type FetchDeps = {
  /** Toutes les adresses IP du nom d'hôte. */
  resolve(host: string): Promise<Address[]>
  /** GET sur `url`, connexion forcée à `address` (déjà vérifiée), sans suivre les redirections. */
  get(url: URL, address: Address): Promise<Response>
}

const MAX_REDIRECTS = 3
const UNREACHABLE = 'Impossible de télécharger cette image.'

// Adresses jamais contactées : bouclage, réseaux privés, link-local (métadonnées cloud), partagées, réservées, multicast.
const BLOCKED = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96]] as const) BLOCKED.addSubnet(net, prefix, 'ipv6')

export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address) // IPv4 écrite en IPv6
  if (mapped) return BLOCKED.check(mapped[1], 'ipv4')
  const family = isIP(address)
  return family === 0 || BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export const networkDeps: FetchDeps = {
  resolve: async (host) => (await lookup(host, { all: true, verbatim: true })) as Address[],
  get: (url, address) => new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { Accept: 'image/*', 'User-Agent': 'ParcoursScratch/1.0 (vignette)' },
      timeout: FETCH_TIMEOUT_MS,
      // Connexion épinglée sur l'adresse vérifiée (pas de seconde résolution DNS) ; le nom reste utilisé pour TLS.
      lookup: (_host, options, callback) => {
        if ((options as { all?: boolean }).all) (callback as (e: null, a: Address[]) => void)(null, [address])
        else callback(null, address.address, address.family)
      },
    }, (res) => {
      const headers = new Headers()
      for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers.set(k, v)
      const status = res.statusCode ?? 502
      const body = status >= 300 && status < 400 ? (res.resume(), null) : (Readable.toWeb(res) as ReadableStream<Uint8Array>)
      resolve(new Response(body, { status, headers }))
    })
    request.on('timeout', () => request.destroy(new Error('délai dépassé')))
    request.on('error', reject)
  }),
}

/** Adresses autorisées pour cet hôte, ou null s'il en a une interne (ou aucune). */
async function vetHost(hostname: string, deps: FetchDeps): Promise<Address | null> {
  const host = hostname.replace(/^\[(.*)\]$/, '$1')
  const literal = isIP(host)
  const addresses: Address[] = literal ? [{ address: host, family: literal as 4 | 6 }] : await deps.resolve(host)
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) return null
  return addresses[0]
}

/** Télécharge une image (une seule fois) pour la stocker comme une image envoyée. */
export async function fetchThumbnail(url: string, deps: FetchDeps = networkDeps): Promise<Processed> {
  let current: URL
  try { current = new URL(url.trim()) } catch { return { ok: false, error: 'Adresse invalide.' } }
  for (let hop = 0; ; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') return { ok: false, error: 'L’adresse doit commencer par http:// ou https://.' }
    let res: Response
    try {
      const address = await vetHost(current.hostname, deps)
      if (!address) return { ok: false, error: 'Cette adresse n’est pas autorisée.' }
      res = await deps.get(current, address)
    } catch {
      return { ok: false, error: UNREACHABLE }
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) return { ok: false, error: UNREACHABLE }
      try { current = new URL(location, current) } catch { return { ok: false, error: UNREACHABLE } }
      continue
    }
    if (!res.ok) { await res.body?.cancel(); return { ok: false, error: UNREACHABLE } }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_THUMBNAIL_BYTES) {
      await res.body?.cancel()
      return { ok: false, error: TOO_LARGE }
    }
    const bytes = await readBodyLimited(res, MAX_THUMBNAIL_BYTES)
    if (!bytes) return { ok: false, error: TOO_LARGE }
    return processThumbnail(bytes)
  }
}

/** Fichier stocké d'une vignette envoyée, ou null (vignette livrée avec le site, ou nom non conforme). */
export function thumbnailFile(publicUrl: string): string | null {
  const m = PUBLIC.exec(publicUrl)
  return m ? `vignettes/${m[1]}` : null
}

const currentThumbnail = async (db: DB, activityId: string) =>
  (await db.select({ thumbnail: activities.thumbnail }).from(activities).where(eq(activities.id, activityId)).limit(1))[0]

/** Remplace la vignette d'une activité ; renvoie son URL publique, ou null si l'activité n'existe pas. */
export async function saveThumbnail(db: DB, activityId: string, webp: Uint8Array): Promise<string | null> {
  const row = UUID.test(activityId) ? await currentThumbnail(db, activityId) : undefined
  if (!row) return null
  const name = `${activityId}-${Date.now()}.webp`
  await writeStored(`vignettes/${name}`, webp)
  const url = `/api/vignettes/${name}`
  await db.update(activities).set({ thumbnail: url, updatedAt: new Date().toISOString() }).where(eq(activities.id, activityId))
  const previous = row.thumbnail ? thumbnailFile(row.thumbnail) : null
  if (previous) await deleteStored(previous)
  return url
}

/** Retire la vignette : la carte élève affiche l'icône par défaut. */
export async function clearThumbnail(db: DB, activityId: string): Promise<void> {
  const row = UUID.test(activityId) ? await currentThumbnail(db, activityId) : undefined
  if (!row) return
  await db.update(activities).set({ thumbnail: null, updatedAt: new Date().toISOString() }).where(eq(activities.id, activityId))
  const previous = row.thumbnail ? thumbnailFile(row.thumbnail) : null
  if (previous) await deleteStored(previous)
}
