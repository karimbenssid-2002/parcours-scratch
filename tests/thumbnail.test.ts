import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { upsertBreizhActivity } from '@/lib/db/activities'
import { activities } from '@/lib/db/schema'
import { readStored } from '@/lib/storage/files'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { MAX_THUMBNAIL_BYTES, clearThumbnail, fetchThumbnail, networkDeps, processThumbnail, saveThumbnail, thumbnailFile } from '@/lib/activities/thumbnail'

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vignettes-'))
})

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#4c97ff' } }).png().toBuffer().then((b) => new Uint8Array(b))
const isWebp = (b: Uint8Array) => Buffer.from(b.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString() === 'WEBP'
const PUBLIC_IP = { address: '93.184.216.34', family: 4 as const }
type Deps = NonNullable<Parameters<typeof fetchThumbnail>[1]>
/** Réseau simulé : résolution DNS et réponses par adresse ; garde la trace des connexions (adresse épinglée). */
function net(responses: Record<string, () => Promise<Response> | Response>, dns: Record<string, { address: string; family: 4 | 6 }[]> = {}) {
  const calls: { url: string; address: string }[] = []
  const deps: Deps = {
    resolve: async (host) => dns[host] ?? [PUBLIC_IP],
    get: async (url, address) => {
      calls.push({ url: url.href, address: address.address })
      const r = responses[url.href]
      if (!r) throw new Error('réseau : ' + url.href)
      return r()
    },
  }
  return { deps, calls }
}
const ok = (body: Uint8Array, headers: Record<string, string> = {}, status = 200) => () => new Response(body as BodyInit, { status, headers })
const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } })

async function activity() {
  const db = await testDb()
  const { id } = await upsertBreizhActivity(db, { sourceRef: 1, title: 'Le serpent', slug: 'serpent', statementYoutubeId: null, thumbnail: '/activities/leSerpent.png' })
  return { db, id }
}

describe('processThumbnail', () => {
  it('convertit une image en WebP de 800 px de large au plus', async () => {
    const result = await processThumbnail(await png(1600, 1000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(isWebp(result.webp)).toBe(true)
    const meta = await sharp(result.webp).metadata()
    expect([meta.width, meta.height]).toEqual([800, 500])
  })

  it('n’agrandit pas une petite image', async () => {
    const result = await processThumbnail(await png(300, 200))
    expect(result.ok && (await sharp(result.webp).metadata()).width).toBe(300)
  })

  it('refuse un fichier qui n’est pas une image, même nommé .png', async () => {
    expect(await processThumbnail(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toMatchObject({ ok: false })
    expect(await processThumbnail(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toMatchObject({ ok: false }) // en-tête PNG tronqué
  })

  it('refuse une image trop lourde', async () => {
    const big = new Uint8Array(MAX_THUMBNAIL_BYTES + 1)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(await processThumbnail(big)).toEqual({ ok: false, error: 'L’image dépasse 2 Mo.' })
  })
})

describe('fetchThumbnail', () => {
  it('refuse une adresse qui n’est pas http(s)', async () => {
    for (const url of ['ftp://exemple.fr/a.png', 'javascript:alert(1)', 'file:///etc/passwd', 'pas une adresse'])
      expect(await fetchThumbnail(url, net({}).deps)).toMatchObject({ ok: false })
  })

  it('télécharge et convertit une image, en se connectant à l’adresse vérifiée', async () => {
    const { deps, calls } = net({ 'https://exemple.fr/vignette.png': ok(await png(1200, 900), { 'content-type': 'image/png' }) })
    const result = await fetchThumbnail('https://exemple.fr/vignette.png', deps)
    expect(result.ok && isWebp(result.webp)).toBe(true)
    expect(calls).toEqual([{ url: 'https://exemple.fr/vignette.png', address: PUBLIC_IP.address }])
  })

  it('refuse les adresses internes : bouclage, réseau privé, link-local, métadonnées cloud, IPv6', async () => {
    const internal = ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.10', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']
    for (const address of internal) {
      const { deps, calls } = net({ 'https://interne.fr/x.png': ok(await png(10, 10)) }, { 'interne.fr': [{ address, family: address.includes(':') ? 6 : 4 }] })
      expect(await fetchThumbnail('https://interne.fr/x.png', deps), address).toMatchObject({ ok: false })
      expect(calls, address).toEqual([]) // aucune connexion
    }
    // Une seule adresse interne parmi plusieurs suffit à refuser.
    const { deps } = net({}, { 'mixte.fr': [PUBLIC_IP, { address: '10.0.0.1', family: 4 }] })
    expect(await fetchThumbnail('https://mixte.fr/x.png', deps)).toMatchObject({ ok: false })
  })

  it('refuse une adresse IP interne écrite directement', async () => {
    for (const url of ['http://127.0.0.1/x.png', 'http://[::1]/x.png', 'http://169.254.169.254/latest/meta-data/']) {
      const { deps, calls } = net({}, {})
      expect(await fetchThumbnail(url, { ...deps, resolve: async () => { throw new Error('pas de DNS pour une IP') } }), url).toMatchObject({ ok: false })
      expect(calls, url).toEqual([])
    }
  })

  it('suit une redirection vers un site public, mais pas vers une adresse interne', async () => {
    const image = await png(10, 10)
    const followed = net({ 'https://a.fr/x': redirect('https://b.fr/y.png'), 'https://b.fr/y.png': ok(image) })
    expect((await fetchThumbnail('https://a.fr/x', followed.deps)).ok).toBe(true)

    const toInternal = net({ 'https://a.fr/x': redirect('http://localhost:3000/admin'), 'http://localhost:3000/admin': ok(image) },
      { localhost: [{ address: '127.0.0.1', family: 4 }] })
    expect(await fetchThumbnail('https://a.fr/x', toInternal.deps)).toMatchObject({ ok: false })
    expect(toInternal.calls.map((c) => c.url)).toEqual(['https://a.fr/x'])
  })

  it('s’arrête après trop de redirections', async () => {
    const loop = net({ 'https://a.fr/1': redirect('https://a.fr/2'), 'https://a.fr/2': redirect('https://a.fr/3'),
      'https://a.fr/3': redirect('https://a.fr/4'), 'https://a.fr/4': redirect('https://a.fr/5'), 'https://a.fr/5': ok(await png(10, 10)) })
    expect(await fetchThumbnail('https://a.fr/1', loop.deps)).toMatchObject({ ok: false })
  })

  it('refuse une page HTML, une erreur HTTP ou un fichier annoncé trop gros', async () => {
    expect(await fetchThumbnail('https://exemple.fr/', net({ 'https://exemple.fr/': ok(new TextEncoder().encode('<html></html>'), { 'content-type': 'text/html' }) }).deps)).toMatchObject({ ok: false })
    expect(await fetchThumbnail('https://exemple.fr/x.png', net({ 'https://exemple.fr/x.png': ok(new Uint8Array(), {}, 404) }).deps))
      .toEqual({ ok: false, error: 'Impossible de télécharger cette image.' })
    expect(await fetchThumbnail('https://exemple.fr/x.png', net({ 'https://exemple.fr/x.png': ok(await png(10, 10), { 'content-length': String(MAX_THUMBNAIL_BYTES + 1) }) }).deps))
      .toEqual({ ok: false, error: 'L’image dépasse 2 Mo.' })
  })

  it('signale un site injoignable ou inexistant', async () => {
    expect(await fetchThumbnail('https://exemple.fr/x.png', net({}).deps)).toEqual({ ok: false, error: 'Impossible de télécharger cette image.' })
    const noDns = net({}).deps
    expect(await fetchThumbnail('https://exemple.invalid/x.png', { ...noDns, resolve: async () => { throw new Error('ENOTFOUND') } }))
      .toEqual({ ok: false, error: 'Impossible de télécharger cette image.' })
  })
})

describe('saveThumbnail / clearThumbnail', () => {
  it('enregistre la vignette, la sert sous un nouveau nom et supprime l’ancienne', async () => {
    const { db, id } = await activity()
    const first = await saveThumbnail(db, id, new Uint8Array([1, 2, 3]))
    expect(first).toMatch(new RegExp(`^/api/vignettes/${id}-\\d+\\.webp$`))
    expect((await db.select({ t: activities.thumbnail }).from(activities).where(eq(activities.id, id)).limit(1))[0]?.t).toBe(first)
    const firstFile = thumbnailFile(first!)!
    expect([...(await readStored(firstFile))!]).toEqual([1, 2, 3])

    await new Promise((r) => setTimeout(r, 5))
    const second = await saveThumbnail(db, id, new Uint8Array([4]))
    expect(second).not.toBe(first)
    expect(await readStored(firstFile)).toBeNull()

    await clearThumbnail(db, id)
    expect((await db.select({ t: activities.thumbnail }).from(activities).where(eq(activities.id, id)).limit(1))[0]?.t).toBeNull()
    expect(await readStored(thumbnailFile(second!)!)).toBeNull()
  })

  it('ne touche pas aux vignettes livrées avec le site (/activities/…)', async () => {
    const { db, id } = await activity()
    await clearThumbnail(db, id)
    expect(thumbnailFile('/activities/leSerpent.png')).toBeNull()
  })

  it('refuse une activité inconnue', async () => {
    const { db } = await activity()
    expect(await saveThumbnail(db, '00000000-0000-4000-8000-000000000000', new Uint8Array([1]))).toBeNull()
  })

  it('thumbnailFile n’accepte que les noms générés (pas de chemin arbitraire)', () => {
    expect(thumbnailFile('/api/vignettes/../../.env')).toBeNull()
    expect(thumbnailFile('/api/vignettes/x.webp')).toBeNull()
  })
})

describe('networkDeps.get (connexion réelle)', () => {
  it('se connecte à l’adresse vérifiée sans résoudre le nom, et ne suit pas les redirections', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/redir') { res.writeHead(302, { location: 'http://ailleurs.test/' }); return res.end() }
      res.writeHead(200, { 'content-type': 'text/plain', 'x-host': req.headers.host ?? '' })
      res.end('bonjour')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as AddressInfo
    try {
      // « nom-inexistant.test » ne se résout pas : seule l'adresse épinglée permet la connexion.
      const res = await networkDeps.get(new URL(`http://nom-inexistant.test:${port}/x`), { address: '127.0.0.1', family: 4 })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-host')).toBe(`nom-inexistant.test:${port}`)
      expect(await res.text()).toBe('bonjour')
      const redir = await networkDeps.get(new URL(`http://nom-inexistant.test:${port}/redir`), { address: '127.0.0.1', family: 4 })
      expect([redir.status, redir.headers.get('location')]).toEqual([302, 'http://ailleurs.test/'])
    } finally {
      server.close()
    }
  })
})
