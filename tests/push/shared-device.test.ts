import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { saveSubscription } from '@/lib/db/push-subscriptions'

const holder: { db: Awaited<ReturnType<typeof testDb>> | null } = { db: null }
vi.mock('@/lib/db/client', () => ({ getDb: () => holder.db }))
import { dropForeignDeviceSubscription } from '@/lib/push/device'

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } })
const rows = (db: Awaited<ReturnType<typeof testDb>>) => db.select().from(pushSubscriptions)
const req = (cookie: string) => new Request('http://localhost/auth/google/callback', { headers: { cookie } })

describe('appareil partagé', () => {
  it('B s’abonne avec le même point d’accès que A (même type) : la ligne de A disparaît', async () => {
    const db = await testDb()
    await saveSubscription(db, { kind: 'student', id: 'A' }, sub('https://fcm.googleapis.com/x'))
    await saveSubscription(db, { kind: 'student', id: 'B' }, sub('https://fcm.googleapis.com/x'))
    expect((await rows(db)).map((r) => r.ownerId)).toEqual(['B'])
  })

  it('élève et enseignant sur le même appareil : les deux lignes restent', async () => {
    const db = await testDb()
    await saveSubscription(db, { kind: 'student', id: 'A' }, sub('https://fcm.googleapis.com/x'))
    await saveSubscription(db, { kind: 'teacher', id: 'T' }, sub('https://fcm.googleapis.com/x'))
    expect(await rows(db)).toHaveLength(2)
  })

  it('connexion de B avec le cookie d’appareil de A : ligne de A supprimée, cookie effacé', async () => {
    const db = await testDb()
    holder.db = db
    const idA = await saveSubscription(db, { kind: 'student', id: 'A' }, sub('https://fcm.googleapis.com/x'))
    const res = NextResponse.next()
    await dropForeignDeviceSubscription(req(`push_device_eleve=${idA}`), res, 'eleve', { kind: 'student', id: 'B' })
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, idA))).toHaveLength(0)
    expect(res.headers.get('set-cookie')).toMatch(/push_device_eleve=;/)
  })

  it('même compte qui se reconnecte : ligne et cookie conservés', async () => {
    const db = await testDb()
    holder.db = db
    const idA = await saveSubscription(db, { kind: 'student', id: 'A' }, sub('https://fcm.googleapis.com/x'))
    const res = NextResponse.next()
    await dropForeignDeviceSubscription(req(`push_device_eleve=${idA}`), res, 'eleve', { kind: 'student', id: 'A' })
    expect(await rows(db)).toHaveLength(1)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('connexion d’un élève avec un cookie nommant une ligne d’enseignant : ligne conservée', async () => {
    const db = await testDb()
    holder.db = db
    const idT = await saveSubscription(db, { kind: 'teacher', id: 'T' }, sub('https://fcm.googleapis.com/z'))
    await dropForeignDeviceSubscription(req(`push_device_eleve=${idT}`), NextResponse.next(), 'eleve', { kind: 'student', id: 'B' })
    expect(await rows(db)).toHaveLength(1)
  })

  it('un cookie d’élève ne touche pas la ligne d’un enseignant ; erreur de base ou cookie absent : sans effet', async () => {
    const db = await testDb()
    holder.db = db
    const idT = await saveSubscription(db, { kind: 'teacher', id: 'T' }, sub('https://fcm.googleapis.com/y'))
    await dropForeignDeviceSubscription(req(''), NextResponse.next(), 'admin', { kind: 'teacher', id: 'T' })
    expect(await rows(db)).toHaveLength(1)
    holder.db = null
    await expect(dropForeignDeviceSubscription(req(`push_device_admin=${idT}`), NextResponse.next(), 'admin', { kind: 'teacher', id: 'U' })).resolves.toBeUndefined()
  })
})
