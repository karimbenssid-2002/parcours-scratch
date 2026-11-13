import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import { pushSubscriptions } from '@/lib/db/schema'

const ctx = vi.hoisted(() => ({ db: null as unknown, student: null as null | { id: string }, teacher: null as null | { id: string } }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))
vi.mock('@/lib/auth/session', () => ({
  getStudentForApi: async () => ctx.student,
  getTeacherForApi: async () => ctx.teacher,
}))

const { GET, POST, DELETE } = await import('@/app/api/notifications/abonnement/route')

type TestDb = Awaited<ReturnType<typeof testDb>>
const dbNow = () => ctx.db as TestDb
const valid = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPabc-_123', auth: 'au-_th1' } }
const post = (body: unknown, app = 'admin', cookie?: string) =>
  new Request(`http://localhost/api/notifications/abonnement?app=${app}`, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: cookie ? { cookie } : {},
  })
const del = (app = 'admin', cookie?: string) =>
  new Request(`http://localhost/api/notifications/abonnement?app=${app}`, { method: 'DELETE', headers: cookie ? { cookie } : {} })

beforeEach(async () => {
  vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublicKeyDeTest')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'cle-privee-de-test')
  vi.stubEnv('VAPID_SUBJECT', 'mailto:contact@exemple.invalid')
  ctx.db = await testDb()
  ctx.student = null
  ctx.teacher = { id: 'teacher-1' }
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/notifications/abonnement', () => {
  it('404 sans clés VAPID', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    expect((await POST(post(valid))).status).toBe(404)
  })
  it('401 sans session', async () => {
    ctx.teacher = null
    expect((await POST(post(valid))).status).toBe(401)
  })
  it('400 : app inconnue, JSON illisible, endpoint http, clé manquante, clé non base64url, endpoint trop long', async () => {
    expect((await POST(post(valid, 'autre'))).status).toBe(400)
    expect((await POST(post('pas du json'))).status).toBe(400)
    expect((await POST(post({ ...valid, endpoint: 'http://push.example.test/abc' }))).status).toBe(400)
    expect((await POST(post({ endpoint: valid.endpoint, keys: { p256dh: 'abc' } }))).status).toBe(400)
    expect((await POST(post({ endpoint: valid.endpoint, keys: { p256dh: 'a b!', auth: 'abc' } }))).status).toBe(400)
    expect((await POST(post({ ...valid, endpoint: 'https://x.test/' + 'a'.repeat(1000) }))).status).toBe(400)
  })
  it('400 pour un hôte hors liste, un faux sous-domaine, une IP, des identifiants ou un port', async () => {
    for (const endpoint of [
      'https://push.example.test/abc', 'https://fcm.googleapis.com.evil.test/x', 'https://127.0.0.1/x',
      'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://evilpush.apple.com.test/x',
    ]) expect((await POST(post({ ...valid, endpoint }))).status, endpoint).toBe(400)
  })
  it('201 pour les services push connus', async () => {
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/x']) {
      expect((await POST(post({ ...valid, endpoint }))).status, endpoint).toBe(201)
    }
  })
  it('413 pour un corps trop gros', async () => {
    expect((await POST(post('x'.repeat(9000)))).status).toBe(413)
  })
  it('sujet VAPID invalide : notifications désactivées (404), valeur absente du journal', async () => {
    vi.stubEnv('VAPID_SUBJECT', 'pas-un-sujet-secret')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await POST(post(valid))).status).toBe(404)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('pas-un-sujet-secret')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:contact@exemple.invalid')
    expect((await POST(post(valid))).status).toBe(201)
    warn.mockRestore()
  })
  it('201 + cookie push_device_admin httpOnly', async () => {
    const res = await POST(post(valid))
    expect(res.status).toBe(201)
    const [row] = await dbNow().select().from(pushSubscriptions)
    expect(row).toMatchObject({ ownerKind: 'teacher', ownerId: 'teacher-1', endpoint: valid.endpoint })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`push_device_admin=${row.id}`)
    expect(cookie.toLowerCase()).toContain('httponly')
  })
  it('élève : cookie push_device_eleve', async () => {
    ctx.teacher = null
    ctx.student = { id: 'student-1' }
    const res = await POST(post(valid, 'eleve'))
    expect(res.status).toBe(201)
    expect(res.headers.get('set-cookie')).toContain('push_device_eleve=')
  })
  it('un même appareil réabonné ne crée pas de doublon', async () => {
    await POST(post(valid))
    await POST(post(valid))
    expect(await dbNow().select().from(pushSubscriptions)).toHaveLength(1)
  })
})

describe('DELETE /api/notifications/abonnement', () => {
  it('supprime la ligne du cookie et efface le cookie', async () => {
    await POST(post(valid))
    const [row] = await dbNow().select().from(pushSubscriptions)
    const res = await DELETE(del('admin', `push_device_admin=${row.id}`))
    expect(res.status).toBe(200)
    expect(await dbNow().select().from(pushSubscriptions)).toHaveLength(0)
    expect(res.headers.get('set-cookie')).toMatch(/push_device_admin=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })
  it('401 sans session', async () => {
    ctx.teacher = null
    expect((await DELETE(del())).status).toBe(401)
  })
  it('un autre compte ne peut pas supprimer cet abonnement', async () => {
    await POST(post(valid))
    const [row] = await dbNow().select().from(pushSubscriptions)
    ctx.teacher = null
    ctx.student = { id: 'student-2' }
    await DELETE(del('eleve', `push_device_eleve=${row.id}`))
    expect(await dbNow().select().from(pushSubscriptions)).toHaveLength(1)
  })
})

describe('GET /api/notifications/abonnement', () => {
  const get = (cookie?: string, endpoint: string | null = valid.endpoint, app = 'admin') =>
    new Request(`http://localhost/api/notifications/abonnement?app=${app}${endpoint ? `&endpoint=${encodeURIComponent(endpoint)}` : ''}`,
      { headers: cookie ? { cookie } : {} })
  const body = async (res: Response) => (await res.json()) as { subscribed: boolean }

  it('404 sans clés VAPID, 400 app inconnue, 401 sans session', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    expect((await GET(get())).status).toBe(404)
    vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublicKeyDeTest')
    expect((await GET(get(undefined, valid.endpoint, 'autre'))).status).toBe(400)
    ctx.teacher = null
    expect((await GET(get())).status).toBe(401)
  })
  it('vrai pour la ligne de son propre cookie avec le même point d’accès', async () => {
    await POST(post(valid))
    const [row] = await dbNow().select().from(pushSubscriptions)
    expect(await body(await GET(get(`push_device_admin=${row.id}`)))).toEqual({ subscribed: true })
  })
  it('faux : pas de cookie, autre point d’accès, point d’accès absent, cookie forgé ou non valide', async () => {
    await POST(post(valid))
    const [row] = await dbNow().select().from(pushSubscriptions)
    const c = `push_device_admin=${row.id}`
    expect(await body(await GET(get()))).toEqual({ subscribed: false })
    expect(await body(await GET(get(c, 'https://fcm.googleapis.com/fcm/send/autre')))).toEqual({ subscribed: false })
    expect(await body(await GET(get(c, null)))).toEqual({ subscribed: false })
    expect(await body(await GET(get('push_device_admin=pas-un-uuid')))).toEqual({ subscribed: false })
  })
  it('faux pour le cookie d’un autre compte (téléphone partagé)', async () => {
    await POST(post(valid))
    const [row] = await dbNow().select().from(pushSubscriptions)
    ctx.teacher = { id: 'teacher-2' }
    expect(await body(await GET(get(`push_device_admin=${row.id}`)))).toEqual({ subscribed: false })
  })
})
