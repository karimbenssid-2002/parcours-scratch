import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'

// Gardes de session appelées directement : cookies et redirections de Next remplacés, base de test.
const ctx = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>() }))
vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => ctx.db,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (ctx.cookies.has(name) ? { name, value: ctx.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void ctx.cookies.set(name, value),
    delete: (name: string) => void ctx.cookies.delete(name),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirection:${to}`)
  },
}))

const { approveTeacherRequest } = await import('@/lib/auth/teacher-approval')
const { createTeacherRequest, listPendingRequests } = await import('@/lib/db/teacher-requests')
const { createTeacher, findTeacherByEmail, setTeacherActive } = await import('@/lib/db/teachers')
const { seedAdmin } = await import('@/lib/seed/admin')
const { ADMIN_COOKIE, verifyAdmin, verifyStudent } = await import('@/lib/auth/jwt')
const { adminSessionCookie, getTeacherForApi, requireTeacher } = await import('@/lib/auth/session')
const { teacherRequests, teachers } = await import('@/lib/db/schema')

let db: DB
beforeEach(async () => {
  db = await testDb()
  ctx.db = db
  ctx.cookies.clear()
}, 30_000)

const prof = (email: string) =>
  createTeacher(db, { email, username: email.split('@')[0], firstName: 'Prénom', lastName: 'Nom', role: 'prof' })

describe('approveTeacherRequest', () => {
  it('crée le compte sans mot de passe, identifiant = prenom.nom', async () => {
    expect(await createTeacherRequest(db, 'Marie-Anne.El-Fictif@mlfmonde.org')).toBe('created')
    const [req] = await listPendingRequests(db)
    const res = await approveTeacherRequest(db, req.id)
    expect(res).toEqual({ ok: true, username: 'marie-anne.el-fictif' })
    const t = await findTeacherByEmail(db, 'marie-anne.el-fictif@mlfmonde.org')
    expect(t).toMatchObject({ username: 'marie-anne.el-fictif', role: 'prof', isActive: true, firstName: 'Marie-Anne', lastName: 'El-Fictif' })
    expect(Object.keys(t!).filter((k) => /password/i.test(k))).toEqual([])
    expect(await listPendingRequests(db)).toHaveLength(0)
  })

  it("demande @mlfmonde.org alors qu'un compte @malraux-rabat.org de même identité existe : doublon", async () => {
    await prof('emma.fictive@malraux-rabat.org')
    expect(await createTeacherRequest(db, 'emma.fictive@mlfmonde.org')).toBe('duplicate')
    expect(await listPendingRequests(db)).toHaveLength(0)

    // Demande déjà là avant que le compte n'existe : la validation la refuse.
    const [req] = await db.insert(teacherRequests).values({ email: 'emma.fictive@mlfmonde.org', firstName: 'Emma', lastName: 'Fictive' }).returning()
    expect(await approveTeacherRequest(db, req.id)).toEqual({ ok: false, error: 'Un compte existe déjà pour cet enseignant.' })
    expect(await db.select().from(teachers)).toHaveLength(1)
    expect(await listPendingRequests(db)).toHaveLength(0)
  })

  it('identité déjà prise par un ancien compte à suffixe (username prenom.nom2) : doublon reconnu par l’adresse', async () => {
    await createTeacher(db, { email: 'emma.fictive@malraux-rabat.org', username: 'emma.fictive2', firstName: 'E', lastName: 'F', role: 'prof' })
    expect(await createTeacherRequest(db, 'emma.fictive@mlfmonde.org')).toBe('duplicate')
  })

  it('deux demandes simultanées pour la même identité sur deux domaines : une seule en attente', async () => {
    const results = await Promise.all([
      createTeacherRequest(db, 'chloe.essai@malraux-rabat.org'),
      createTeacherRequest(db, 'Chloe.Essai@mlfmonde.org'),
    ])
    expect(results.sort()).toEqual(['created', 'duplicate'])
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('demande en attente pour la même identité sur l’autre domaine : doublon', async () => {
    await createTeacherRequest(db, 'chloe.essai@malraux-rabat.org')
    expect(await createTeacherRequest(db, 'chloe.essai@mlfmonde.org')).toBe('duplicate')
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('deux validations simultanées : une seule réussit', async () => {
    await createTeacherRequest(db, 'emma.fictive@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const results = await Promise.all([approveTeacherRequest(db, req.id), approveTeacherRequest(db, req.id)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'Demande introuvable ou déjà traitée.' })
  })
})

describe('seedAdmin', () => {
  it('crée le compte admin sans mot de passe ; un deuxième appel ne change rien', async () => {
    expect(await seedAdmin(db, { email: 'Admin.Fictif@malraux-rabat.org' })).toBe('created')
    const created = await findTeacherByEmail(db, 'admin.fictif@malraux-rabat.org')
    expect(created).toMatchObject({ role: 'admin', username: 'admin.fictif', isActive: true })
    expect(Object.keys(created!).filter((k) => /password/i.test(k))).toEqual([])

    expect(await seedAdmin(db, { email: 'admin.fictif@malraux-rabat.org' })).toBe('exists')
    expect(await db.select().from(teachers)).toEqual([created])
  })

  it("refuse de créer l'admin si un autre compte porte déjà son identifiant", async () => {
    await prof('admin.fictif@mlfmonde.org')
    await expect(seedAdmin(db, { email: 'admin.fictif@malraux-rabat.org' })).rejects.toThrow(/existe déjà/)
    expect(await db.select().from(teachers)).toHaveLength(1)
  })
})

describe('sessions sans mot de passe', () => {
  const oldToken = (claims: Record<string, unknown>, audience: 'admin' | 'student') =>
    new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setAudience(audience).setIssuedAt().setExpirationTime('1h')
      .sign(new TextEncoder().encode(audience === 'admin' ? process.env.AUTH_SECRET : process.env.STUDENT_AUTH_SECRET))

  it("refuse un jeton à l'ancien format (avec mustChangePassword)", async () => {
    const old = { mustChangePassword: false }
    expect(await verifyAdmin(await oldToken({ teacherId: 't1', username: 'emma.fictive', role: 'prof', ...old }, 'admin'))).toBeNull()
    expect(await verifyStudent(await oldToken({ studentId: 's1', ...old }, 'student'))).toBeNull()
    // Le format actuel passe.
    expect(await verifyAdmin(await oldToken({ teacherId: 't1', username: 'emma.fictive', role: 'prof' }, 'admin')))
      .toEqual({ teacherId: 't1', username: 'emma.fictive', role: 'prof' })
    expect(await verifyStudent(await oldToken({ studentId: 's1' }, 'student'))).toEqual({ studentId: 's1' })
  })

  it('enseignant désactivé avec une session ouverte : renvoyé à la connexion', async () => {
    const t = await prof('emma.fictive@malraux-rabat.org')
    const cookie = await adminSessionCookie(t)
    ctx.cookies.set(cookie.name, cookie.value)
    await expect(requireTeacher()).resolves.toMatchObject({ id: t.id })

    await setTeacherActive(db, t.id, false)
    // /admin/deconnexion efface le cookie et mène à /admin/login.
    await expect(requireTeacher()).rejects.toThrow('redirection:/admin/deconnexion')
    expect(await getTeacherForApi()).toBeNull()
  })

  it("session à l'ancien format : renvoyée à la connexion", async () => {
    const t = await prof('emma.fictive@malraux-rabat.org')
    ctx.cookies.set(ADMIN_COOKIE, await oldToken({ teacherId: t.id, username: 'emma.fictive', role: 'prof', mustChangePassword: false }, 'admin'))
    await expect(requireTeacher()).rejects.toThrow('redirection:/admin/login')
  })
})
