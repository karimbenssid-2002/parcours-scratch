import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { classStudents, pushSubscriptions, teachers } from '@/lib/db/schema'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { saveSubscription } from '@/lib/db/push-subscriptions'
import { sendPush } from '@/lib/push/send'

const message = { title: 'Parcours Scratch', body: 'Une nouvelle activité', url: '/' }
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: `p256dh${n}`, auth: `auth${n}` } })

async function teacher(db: Awaited<ReturnType<typeof testDb>>, name = 'prof.test') {
  return createTeacher(db, { email: `${name}@exemple.invalid`, firstName: 'Prof', lastName: 'Test', username: name, role: 'prof' })
}

afterEach(() => vi.restoreAllMocks())

describe('sendPush', () => {
  it('envoie à chaque abonnement d’un enseignant', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('b'))
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })
    expect(send).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ sent: 2, removed: 0, failed: 0 })
  })

  it('supprime un abonnement qui répond 410 et compte les autres', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('gone'))
    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })
    expect(r).toEqual({ sent: 1, removed: 1, failed: 0 })
    const rows = await db.select().from(pushSubscriptions)
    expect(rows.map((x) => x.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/a'])
  })

  it('supprime aussi sur 404', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    const send = vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode: 404 }) })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })).toEqual({ sent: 0, removed: 1, failed: 0 })
  })

  it('une erreur réseau compte un échec sans lever d’exception ni supprimer', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    const send = vi.fn(async () => { throw new Error('ECONNRESET') })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })
    expect(r).toEqual({ sent: 0, removed: 0, failed: 1 })
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1)
  })

  it('ignore un enseignant désactivé', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    await db.update(teachers).set({ isActive: false }).where(eq(teachers.id, t.id))
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })).toEqual({ sent: 0, removed: 0, failed: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it('envoie à un élève inscrit, pas à un élève retiré de toutes ses classes', async () => {
    const db = await testDb()
    const t = await teacher(db)
    const cls = await createClass(db, t.id, { name: '6A', level: '6' })
    const s = await createStudent(db, { email: 'eleve.test@exemple.invalid' })
    await addEmailsToClass(db, cls.id, [s.email])
    await saveSubscription(db, { kind: 'student', id: s.id }, sub('e'))
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await sendPush(db, [{ kind: 'student', id: s.id }], message, { send })).sent).toBe(1)
    await db.delete(classStudents)
    send.mockClear()
    expect(await sendPush(db, [{ kind: 'student', id: s.id }], message, { send })).toEqual({ sent: 0, removed: 0, failed: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it('dédoublonne les destinataires', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await sendPush(db, [{ kind: 'teacher', id: t.id }, { kind: 'teacher', id: t.id }], message, { send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
  })

  it('envoie au plus 10 à la fois', async () => {
    const db = await testDb()
    const owners = []
    for (let o = 0; o < 5; o++) {
      const t = await teacher(db, `prof.test${o}`)
      owners.push({ kind: 'teacher' as const, id: t.id })
      for (let i = 0; i < 5; i++) await saveSubscription(db, owners[o], sub(`n${o}-${i}`))
    }
    let running = 0, max = 0
    const send = vi.fn(async () => { running++; max = Math.max(max, running); await new Promise((r) => setTimeout(r, 5)); running-- })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await sendPush(db, owners, message, { send })).sent).toBe(25)
    expect(max).toBeLessThanOrEqual(10)
    expect(max).toBeGreaterThan(1)
  })

  it('garde 10 abonnements par compte (les plus anciens sont supprimés) et n’envoie qu’à ceux-là', async () => {
    const db = await testDb()
    const t = await teacher(db)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (let i = 0; i < 12; i++) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
        await saveSubscription(db, { kind: 'teacher', id: t.id }, sub(`n${i}`))
      }
    } finally { vi.useRealTimers() }
    const rows = await db.select().from(pushSubscriptions)
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.endpoint)).not.toContain(sub('n0').endpoint)
    expect(rows.map((r) => r.endpoint)).not.toContain(sub('n1').endpoint)
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })).sent).toBe(10)
  })

  it('n’appelle jamais un hôte hors liste stocké en base et supprime la ligne', async () => {
    const db = await testDb()
    const t = await teacher(db)
    await db.insert(pushSubscriptions).values({ ownerKind: 'teacher', ownerId: t.id, endpoint: 'https://127.0.0.1/x', p256dh: 'a', auth: 'b' })
    const send = vi.fn(async () => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send })).toEqual({ sent: 0, removed: 1, failed: 0 })
    expect(send).not.toHaveBeenCalled()
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
  })

  it('le journal ne contient ni endpoint ni nom', async () => {
    const db = await testDb()
    const t = await teacher(db, 'nom.secret')
    await saveSubscription(db, { kind: 'teacher', id: t.id }, sub('a'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendPush(db, [{ kind: 'teacher', id: t.id }], message, { send: async () => { throw new Error('https://fcm.googleapis.com/fcm/send/a nom.secret') } })
    const lines = [...log.mock.calls, ...warn.mock.calls, ...err.mock.calls].map((c) => c.join(' '))
    expect(lines.some((l) => l.includes('[notifications] envoyées=0 supprimées=0 échecs=1'))).toBe(true)
    for (const l of lines) {
      expect(l).not.toContain('fcm.googleapis.com')
      expect(l).not.toContain('nom.secret')
    }
  })

  it('ne lève jamais, même si la base échoue', async () => {
    const db = await testDb()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new Proxy(db, { get: () => () => { throw new Error('base indisponible') } })
    await expect(sendPush(broken as typeof db, [{ kind: 'teacher', id: 'x' }], message, { send: async () => {} }))
      .resolves.toEqual({ sent: 0, removed: 0, failed: 0 })
  })
})
