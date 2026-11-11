import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import type { DB } from '@/lib/db/client'

// Gardes de session élève appelées directement : cookies et redirections de Next remplacés, base de test.
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

const { getStudentForApi, requireStudent, studentSessionCookie } = await import('@/lib/auth/session')
const { createStudent } = await import('@/lib/db/students')
const { createTeacher } = await import('@/lib/db/teachers')
const { addEmailsToClass, createClass, removeEmailFromClass } = await import('@/lib/db/classes')
const { GET: studentLogout } = await import('@/app/(eleve)/deconnexion/route')
const { GET: adminLogout } = await import('@/app/admin/deconnexion/route')

const EMAIL = 'alice.exemple@malraux-rabat.org'
let db: DB
beforeEach(async () => {
  db = await testDb()
  ctx.db = db
  ctx.cookies.clear()
}, 30_000)

/** Élève connecté (cookie de session posé), inscrit dans une classe ; rend l'id de la classe. */
async function signedInStudent() {
  const owner = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const c = await createClass(db, owner.id, { name: '6e A', level: '6' })
  await addEmailsToClass(db, c.id, [EMAIL])
  const s = await createStudent(db, { email: EMAIL })
  const cookie = await studentSessionCookie(s)
  ctx.cookies.set(cookie.name, cookie.value)
  return { student: s, classId: c.id }
}

describe('session élève et listes de classe', () => {
  it('élève inscrit : accès', async () => {
    const { student } = await signedInStudent()
    expect((await requireStudent()).id).toBe(student.id)
    expect((await getStudentForApi())?.id).toBe(student.id)
  })

  it("retiré de toutes les classes pendant sa session : déconnecté vers ?erreur=non-inscrit, l'API le refuse", async () => {
    const { classId } = await signedInStudent()
    await removeEmailFromClass(db, classId, EMAIL)
    await expect(requireStudent()).rejects.toThrow('redirection:/deconnexion?erreur=non-inscrit')
    expect(await getStudentForApi()).toBeNull()
  })
})

describe('déconnexion', () => {
  const location = (res: Response) => {
    const u = new URL(res.headers.get('location')!)
    return u.pathname + u.search
  }
  const cleared = (res: Response, name: string) =>
    res.headers.getSetCookie().some((c) => c.startsWith(`${name}=;`) || (c.startsWith(`${name}=`) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)))

  it("élève : session effacée, page de connexion avec l'indice de déconnexion", () => {
    const res = studentLogout(new NextRequest('http://localhost:3000/deconnexion'))
    expect(location(res)).toBe('/connexion?deconnexion=1')
    expect(cleared(res, 'student_session')).toBe(true)
  })

  it("élève retiré des classes : session effacée, message « non inscrit » (sans l'indice)", () => {
    const res = studentLogout(new NextRequest('http://localhost:3000/deconnexion?erreur=non-inscrit'))
    expect(location(res)).toBe('/connexion?erreur=non-inscrit')
    expect(cleared(res, 'student_session')).toBe(true)
  })

  it('élève : tout autre code est ignoré', () => {
    const res = studentLogout(new NextRequest('http://localhost:3000/deconnexion?erreur=https://autre.example'))
    expect(location(res)).toBe('/connexion?deconnexion=1')
  })

  it("enseignant : session effacée, page de connexion avec l'indice de déconnexion", () => {
    const res = adminLogout(new NextRequest('http://localhost:3000/admin/deconnexion'))
    expect(location(res)).toBe('/admin/login?deconnexion=1')
    expect(cleared(res, 'admin_session')).toBe(true)
  })
})
