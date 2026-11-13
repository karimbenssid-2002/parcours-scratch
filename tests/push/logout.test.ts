import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testDb } from '../helpers/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { saveSubscription } from '@/lib/db/push-subscriptions'
import { ADMIN_COOKIE, STUDENT_COOKIE, signAdmin, signStudent } from '@/lib/auth/jwt'

const ctx = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))

const adminLogout = (await import('@/app/admin/deconnexion/route')).GET
const studentLogout = (await import('@/app/(eleve)/deconnexion/route')).GET

type TestDb = Awaited<ReturnType<typeof testDb>>
const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'BPabc', auth: 'au-th' } })
const req = (path: string, cookies: Record<string, string>) =>
  new NextRequest(`http://localhost${path}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } })
const rows = async () => (await (ctx.db as TestDb).select().from(pushSubscriptions)).map((r) => r.id)
const adminToken = (teacherId: string) => signAdmin({ teacherId, username: 'prof-test', role: 'prof' })

let teacherRow: string, otherRow: string, studentRow: string
beforeEach(async () => {
  ctx.db = await testDb()
  const db = ctx.db as TestDb
  teacherRow = await saveSubscription(db, { kind: 'teacher', id: 'teacher-1' }, sub(1))
  otherRow = await saveSubscription(db, { kind: 'teacher', id: 'teacher-2' }, sub(2))
  studentRow = await saveSubscription(db, { kind: 'student', id: 'student-1' }, sub(3))
})

describe('déconnexion enseignant', () => {
  it('supprime la ligne du cookie push_device_admin, efface les cookies, redirige', async () => {
    const res = await adminLogout(req('/admin/deconnexion', { [ADMIN_COOKIE]: await adminToken('teacher-1'), push_device_admin: teacherRow }))
    const left = await rows()
    expect(left).not.toContain(teacherRow)
    expect(left).toHaveLength(2)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/login?deconnexion=1')
    const set = res.headers.getSetCookie().join('\n')
    expect(set).toContain(`${ADMIN_COOKIE}=;`)
    expect(set).toContain('push_device_admin=;')
  })
  it('ligne d’un autre compte avec un id de cookie forgé : conservée', async () => {
    const res = await adminLogout(req('/admin/deconnexion', { [ADMIN_COOKIE]: await adminToken('teacher-1'), push_device_admin: otherRow }))
    expect(await rows()).toContain(otherRow)
    expect(res.status).toBe(307)
  })
  it('session absente, invalide ou expirée : le cookie d’appareil suffit, ligne supprimée', async () => {
    for (const session of [{}, { [ADMIN_COOKIE]: 'jeton.invalide' }] as Record<string, string>[]) {
      const id = await saveSubscription(ctx.db as TestDb, { kind: 'teacher', id: 'teacher-1' }, sub(10))
      const res = await adminLogout(req('/admin/deconnexion', { ...session, push_device_admin: id }))
      expect(res.status).toBe(307)
      expect(await rows()).not.toContain(id)
    }
    expect(await rows()).toHaveLength(3)
  })
  it('sans cookie d’appareil : déconnecte quand même, rien supprimé', async () => {
    expect((await adminLogout(req('/admin/deconnexion', { [ADMIN_COOKIE]: await adminToken('teacher-1') }))).status).toBe(307)
    expect(await rows()).toHaveLength(3)
  })
  it('cookie d’appareil non valide (pas un identifiant) : déconnecte quand même', async () => {
    const res = await adminLogout(req('/admin/deconnexion', { push_device_admin: 'pas-un-uuid' }))
    expect(res.status).toBe(307)
    expect(await rows()).toHaveLength(3)
  })
  it('erreur de base : déconnecte quand même', async () => {
    ctx.db = { delete: () => { throw new Error('base indisponible') } }
    const res = await adminLogout(req('/admin/deconnexion', { [ADMIN_COOKIE]: await adminToken('teacher-1'), push_device_admin: teacherRow }))
    expect(res.status).toBe(307)
    expect(res.headers.getSetCookie().join('\n')).toContain(`${ADMIN_COOKIE}=;`)
  })
})

describe('déconnexion élève', () => {
  it('supprime la ligne du cookie push_device_eleve pour l’élève de la session', async () => {
    const token = await signStudent({ studentId: 'student-1' })
    const res = await studentLogout(req('/deconnexion', { [STUDENT_COOKIE]: token, push_device_eleve: studentRow }))
    expect(await rows()).not.toContain(studentRow)
    expect(res.headers.get('location')).toContain('/connexion?deconnexion=1')
    expect(res.headers.getSetCookie().join('\n')).toContain('push_device_eleve=;')
  })
  it('session expirée : le cookie d’appareil suffit', async () => {
    await studentLogout(req('/deconnexion', { push_device_eleve: studentRow }))
    expect(await rows()).not.toContain(studentRow)
  })
  it('id forgé visant la ligne d’un enseignant (session valide) : conservée', async () => {
    const token = await signStudent({ studentId: 'student-1' })
    await studentLogout(req('/deconnexion', { [STUDENT_COOKIE]: token, push_device_eleve: teacherRow }))
    expect(await rows()).toContain(teacherRow)
  })
})
