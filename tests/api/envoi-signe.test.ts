import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'
import type { Student } from '@/lib/db/students'
import type { Teacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { createTeacher } from '@/lib/db/teachers'
import { createActivity, getActivityDetail, setActivityStatus, upsertBreizhActivity } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { getAutogradeDraft } from '@/lib/db/autograde'
import { getProgress } from '@/lib/db/progress'
import { setBucketForTests, type BucketClient } from '@/lib/storage/supabase'
import { uploadProject } from '@/lib/storage/upload-client'

// Session et base remplacées : les routes sont appelées directement, comme le ferait Next.
const ctx = vi.hoisted(() => ({ db: null as unknown, student: null as unknown, teacher: null as unknown }))
vi.mock('@/lib/auth/session', () => ({
  getStudentForApi: async () => ctx.student,
  getTeacherForApi: async () => ctx.teacher,
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))

const projets = await import('@/app/api/projets/[activityId]/route')
const depart = await import('@/app/api/admin/activites/[activityId]/depart/route')
const solution = await import('@/app/api/admin/activites/[activityId]/solution/route')

const sb3 = new Uint8Array(fs.readFileSync('tests/fixtures/defi1-capytale.sb3'))
const sb2 = new Uint8Array(fs.readFileSync('tests/fixtures/le-serpent.sb2'))
const MB = 1024 * 1024

/** Un vrai .sb3 grossi d'un costume non compressé : trop gros pour passer par une fonction Vercel. */
function bigSb3(bytes: number): Uint8Array {
  const files = unzipSync(sb3)
  const filler = new Uint8Array(bytes)
  for (let i = 0; i < filler.length; i += 4096) filler[i] = (i * 7) & 0xff
  return zipSync({ ...files, 'filler.png': [filler, { level: 0 }] })
}

/** Faux bucket en mémoire (le navigateur y dépose directement grâce à l'URL signée). */
function memoryBucket() {
  const files = new Map<string, Uint8Array>()
  const signed: string[] = []
  const upsert = new Map<string, boolean>() // option de chaque URL signée, comme Supabase l'inscrit dans le jeton
  /** Dépôt du navigateur à l'URL signée : sans upsert, Supabase refuse (409) d'écraser un objet existant. */
  const browserPut = (p: string, bytes: Uint8Array): number => {
    if (!upsert.has(p)) return 403
    if (files.has(p) && !upsert.get(p)) return 409
    files.set(p, bytes)
    return 200
  }
  const downloads: string[] = []
  const notFound = () => Object.assign(new Error('Object not found'), { statusCode: '404' })
  const client: BucketClient = {
    upload: async (p, body) => (files.set(p, new Uint8Array(body)), { data: { path: p }, error: null }),
    info: async (p) => {
      const f = files.get(p)
      return f ? { data: { size: f.byteLength }, error: null } : { data: null, error: notFound() }
    },
    download: async (p) => {
      downloads.push(p)
      const f = files.get(p)
      return f ? { data: new Blob([new Uint8Array(f)]), error: null } : { data: null, error: Object.assign(new Error('Object not found'), { statusCode: '404' }) }
    },
    remove: async (ps) => (ps.forEach((p) => files.delete(p)), { data: [], error: null }),
    createSignedUploadUrl: async (p, options) => (signed.push(p), upsert.set(p, options.upsert), { data: { signedUrl: `https://sb.test/storage/v1/object/upload/sign/parcours/${p}?token=tk`, token: 'tk', path: p }, error: null }),
  }
  return { files, signed, downloads, client, browserPut }
}

let bucket: ReturnType<typeof memoryBucket>

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'envoi-'))
  process.env.STORAGE_BACKEND = 'supabase'
  bucket = memoryBucket()
  setBucketForTests(bucket.client)
})

afterEach(() => {
  setBucketForTests(null)
  delete process.env.STORAGE_BACKEND
  ctx.student = ctx.teacher = null
  vi.unstubAllGlobals()
})

const params = (activityId: string) => ({ params: Promise.resolve({ activityId }) })
const url = (route: string) => `http://localhost${route}`
const ticketReq = (route: string) => new NextRequest(url(`${route}?upload=1`))
const confirmReq = (route: string, p: unknown) =>
  new NextRequest(url(route), { method: 'PUT', body: JSON.stringify({ path: p }), headers: { 'Content-Type': 'application/json' } })
const rawReq = (route: string, bytes: Uint8Array) =>
  new NextRequest(url(route), { method: 'PUT', body: new Uint8Array(bytes), headers: { 'Content-Type': 'application/octet-stream' } })

async function student(db: DB, email = 'alice.exemple@malraux-rabat.org') {
  return createStudent(db, { email, passwordHash: 'h' })
}

async function setupDefi() {
  const db = await testDb()
  ctx.db = db
  const alice = await student(db)
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
  const a = await upsertBreizhActivity(db, { sourceRef: 3, title: 'Le serpent', slug: 'le-serpent', statementYoutubeId: null, thumbnail: null })
  await setActivityStatus(db, a.id, 'published')
  const cls = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addEmailsToClass(db, cls.id, [alice.email])
  await addAssignments(db, cls.id, [a.id])
  ctx.student = alice
  return { db, alice: alice as Student, activityId: a.id, route: `/api/projets/${a.id}` }
}

async function setupAdmin() {
  const db = await testDb()
  ctx.db = db
  const admin = await createTeacher(db, { email: 'admin@malraux-rabat.org', username: 'admin', firstName: 'A', lastName: 'B', passwordHash: 'h', role: 'admin' })
  const { id } = await createActivity(db, { title: 'Le serpent' })
  ctx.teacher = admin
  return { db, admin: admin as Teacher, activityId: id }
}

describe('envoi direct des projets des élèves', () => {
  it('un projet de 15 Mo déposé dans le stockage puis confirmé est enregistré', async () => {
    const { db, alice, activityId, route } = await setupDefi()
    const res = await projets.GET(ticketReq(route), params(activityId))
    expect(res.status).toBe(200)
    const ticket = (await res.json()) as { url: string; token: string; path: string }
    expect(ticket.path).toMatch(new RegExp(`^projets/${alice.id}/${activityId}-[0-9a-z-]+\\.sb3$`))
    expect(ticket).toMatchObject({ url: expect.stringContaining('token=tk'), token: 'tk' })

    const big = bigSb3(15 * MB)
    expect(big.byteLength).toBeGreaterThan(15 * MB)
    expect(bucket.browserPut(ticket.path, big)).toBe(200) // le navigateur dépose le fichier sans passer par le serveur
    const saved = await projets.PUT(confirmReq(route, ticket.path), params(activityId))
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ savedAt: expect.any(String) })
    expect((await getProgress(db, alice.id, activityId))?.projectPath).toBe(ticket.path)
    expect(bucket.files.get(ticket.path)?.byteLength).toBe(big.byteLength)
  })

  it('l’URL signée ne permet pas de remplacer le fichier une fois validé (pas d’upsert)', async () => {
    const { db, alice, activityId, route } = await setupDefi()
    const ticket = (await (await projets.GET(ticketReq(route), params(activityId))).json()) as { path: string }
    expect(bucket.browserPut(ticket.path, sb3)).toBe(200)
    expect((await projets.PUT(confirmReq(route, ticket.path), params(activityId))).status).toBe(200)
    // Rejeu de la même URL signée (avant ou après l'envoi du défi) : refusé, le fichier noté reste celui validé.
    expect(bucket.browserPut(ticket.path, new Uint8Array([1, 2, 3]))).toBe(409)
    expect(bucket.files.get(ticket.path)).toEqual(sb3)
    expect((await getProgress(db, alice.id, activityId))?.projectPath).toBe(ticket.path)
  })

  it('refuse (403) un chemin hors du dossier attendu, sans rien supprimer', async () => {
    const { db, alice, activityId, route } = await setupDefi()
    const other = await student(db, 'bob.essai@malraux-rabat.org')
    const forged = [
      `projets/${other.id}/${activityId}-1-abc.sb3`,
      `projets/${alice.id}/00000000-0000-4000-8000-000000000000-1.sb3`,
      `projets/${alice.id}/${activityId}-1/../../x.sb3`,
      `starters/${activityId}.sb3`,
      42,
    ]
    for (const p of forged) {
      if (typeof p === 'string') bucket.files.set(p, sb3)
      const res = await projets.PUT(confirmReq(route, p), params(activityId))
      expect(res.status).toBe(403)
      if (typeof p === 'string') expect(bucket.files.has(p)).toBe(true)
    }
    expect(await getProgress(db, alice.id, activityId)).toBeNull()
  })

  it('refuse (400) un fichier qui n’est pas un .sb3 et le supprime du stockage', async () => {
    const { db, alice, activityId, route } = await setupDefi()
    for (const bytes of [new Uint8Array([1, 2, 3]), sb2]) {
      const { path: p } = (await (await projets.GET(ticketReq(route), params(activityId))).json()) as { path: string }
      bucket.files.set(p, bytes)
      const res = await projets.PUT(confirmReq(route, p), params(activityId))
      expect(res.status).toBe(400)
      expect(bucket.files.has(p)).toBe(false)
    }
    expect(await getProgress(db, alice.id, activityId)).toBeNull()
  })

  it('refuse (413) un fichier de plus de 20 Mo et le supprime du stockage', async () => {
    const { activityId, route } = await setupDefi()
    const { path: p } = (await (await projets.GET(ticketReq(route), params(activityId))).json()) as { path: string }
    bucket.files.set(p, new Uint8Array(21 * MB))
    const res = await projets.PUT(confirmReq(route, p), params(activityId))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'Le projet dépasse 20 Mo.' })
    expect(bucket.files.has(p)).toBe(false)
    // Taille lue dans les métadonnées : le fichier n'est pas téléchargé en mémoire.
    expect(bucket.downloads).toEqual([])
  })

  it('ne délivre pas d’URL pour un défi qui n’est pas ouvert à l’élève', async () => {
    const { route } = await setupDefi()
    const res = await projets.GET(ticketReq(route), params('00000000-0000-4000-8000-000000000000'))
    expect(res.status).toBe(404)
    expect(bucket.signed).toEqual([])
  })

  it('stockage local : envoi direct au serveur, comme avant', async () => {
    delete process.env.STORAGE_BACKEND
    const { db, alice, activityId, route } = await setupDefi()
    expect(await (await projets.GET(ticketReq(route), params(activityId))).json()).toEqual({ direct: true })
    const res = await projets.PUT(rawReq(route, sb3), params(activityId))
    expect(res.status).toBe(200)
    expect((await getProgress(db, alice.id, activityId))?.projectPath).toMatch(/^projets\//)
  })
})

describe('envoi direct des projets de départ et des solutions (administrateur)', () => {
  it('projet de départ : chemin fixe, enregistré au bon format, dépôt supprimé', async () => {
    const { db, activityId } = await setupAdmin()
    const route = `/api/admin/activites/${activityId}/depart`
    const ticket = (await (await depart.GET(ticketReq(route), params(activityId))).json()) as { path: string }
    expect(ticket.path).toBe(`starters/${activityId}.envoi`)
    expect(bucket.browserPut(ticket.path, bigSb3(15 * MB))).toBe(200)
    const res = await depart.PUT(confirmReq(route, ticket.path), params(activityId))
    expect(await res.json()).toEqual({ format: 'sb3' })
    expect(bucket.files.has(`starters/${activityId}.sb3`)).toBe(true)
    expect(bucket.files.has(ticket.path)).toBe(false)
    expect((await getActivityDetail(db, activityId))?.starterProjectPath).toBe(`starters/${activityId}.sb3`)
  })

  it('projet de départ : autre chemin refusé (403), fichier invalide refusé (400) et supprimé', async () => {
    const { activityId } = await setupAdmin()
    const route = `/api/admin/activites/${activityId}/depart`
    bucket.files.set(`projets/x/${activityId}-1.sb3`, sb3)
    expect((await depart.PUT(confirmReq(route, `projets/x/${activityId}-1.sb3`), params(activityId))).status).toBe(403)
    expect((await depart.PUT(confirmReq(route, `solutions/${activityId}.envoi`), params(activityId))).status).toBe(403)
    bucket.files.set(`starters/${activityId}.envoi`, new Uint8Array([1, 2, 3]))
    expect((await depart.PUT(confirmReq(route, `starters/${activityId}.envoi`), params(activityId))).status).toBe(400)
    expect(bucket.files.has(`starters/${activityId}.envoi`)).toBe(false)
  })

  it('un dépôt resté en place (envoi abandonné) est supprimé avant de délivrer une nouvelle URL, sans upsert', async () => {
    const { activityId } = await setupAdmin()
    const route = `/api/admin/activites/${activityId}/depart`
    bucket.files.set(`starters/${activityId}.envoi`, new Uint8Array([9]))
    const ticket = (await (await depart.GET(ticketReq(route), params(activityId))).json()) as { path: string }
    expect(bucket.files.has(ticket.path)).toBe(false)
    expect(bucket.browserPut(ticket.path, sb3)).toBe(200)
    expect(bucket.browserPut(ticket.path, sb2)).toBe(409)
    expect(await (await depart.PUT(confirmReq(route, ticket.path), params(activityId))).json()).toEqual({ format: 'sb3' })
  })

  it('réservé à l’administrateur', async () => {
    const { activityId } = await setupAdmin()
    ctx.teacher = { role: 'prof' }
    expect((await depart.GET(ticketReq(`/x`), params(activityId))).status).toBe(403)
    expect((await solution.GET(ticketReq(`/x`), params(activityId))).status).toBe(403)
    expect(bucket.signed).toEqual([])
  })

  it('solution : enregistrée au bon format, dépôt supprimé', async () => {
    const { db, activityId } = await setupAdmin()
    const route = `/api/admin/activites/${activityId}/solution`
    const ticket = (await (await solution.GET(ticketReq(route), params(activityId))).json()) as { path: string }
    expect(ticket.path).toBe(`solutions/${activityId}.envoi`)
    expect(bucket.browserPut(ticket.path, sb2)).toBe(200)
    const res = await solution.PUT(confirmReq(route, ticket.path), params(activityId))
    expect(await res.json()).toEqual({ format: 'sb2' })
    expect(bucket.files.has(`solutions/${activityId}.sb2`)).toBe(true)
    expect(bucket.files.has(ticket.path)).toBe(false)
    expect(await getAutogradeDraft(db, activityId)).toMatchObject({ hasSolution: true, solutionFormat: 'sb2' })
  })
})

describe('uploadProject (navigateur)', () => {
  it('dépose le fichier à l’URL signée puis confirme le chemin', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push({ url: u, init })
      if (u.endsWith('?upload=1')) return Response.json({ url: 'https://sb.test/sign/p.sb3?token=tk', token: 'tk', path: 'projets/s/a-1.sb3' })
      if (u.startsWith('https://sb.test')) return Response.json({ Key: 'parcours/projets/s/a-1.sb3' })
      return Response.json({ savedAt: 'x' })
    }))
    const blob = new Blob([sb3])
    const res = await uploadProject('/api/projets/a', blob)
    expect(await res.json()).toEqual({ savedAt: 'x' })
    expect(calls.map((c) => [c.init?.method ?? 'GET', c.url])).toEqual([
      ['GET', '/api/projets/a?upload=1'],
      ['PUT', 'https://sb.test/sign/p.sb3?token=tk'],
      ['PUT', '/api/projets/a'],
    ])
    expect(calls[1].init?.body).toBe(blob)
    expect(calls[1].init?.headers).toMatchObject({ 'x-upsert': 'false' })
    expect(JSON.stringify(calls[1].init?.headers)).not.toMatch(/authorization|apikey/i)
    expect(calls[2].init?.body).toBe(JSON.stringify({ path: 'projets/s/a-1.sb3' }))
  })

  it('stockage local : envoi direct ; échec du dépôt : erreur en français sans confirmation', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${u}`)
      return u.endsWith('?upload=1') ? Response.json({ direct: true }) : Response.json({ format: 'sb3' })
    }))
    const blob = new Blob([sb3])
    expect(await (await uploadProject('/api/d', blob)).json()).toEqual({ format: 'sb3' })
    expect(calls).toEqual(['GET /api/d?upload=1', 'PUT /api/d'])

    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${u}`)
      return u.endsWith('?upload=1') ? Response.json({ url: 'https://sb.test/s', token: 't', path: 'p' }) : new Response('quota', { status: 413 })
    }))
    const res = await uploadProject('/api/d', blob)
    expect(res.ok).toBe(false)
    expect(((await res.json()) as { error: string }).error).toMatch(/envoi/i)
    expect(calls).toEqual(['GET /api/d?upload=1', 'PUT https://sb.test/s'])
  })
})
