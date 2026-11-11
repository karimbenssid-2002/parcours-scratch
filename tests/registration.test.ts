import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDb } from './helpers/db'
import { createStudent, findStudentByEmail } from '@/lib/db/students'
import { REGISTRATION_CLOSED, studentRegistrationOpen } from '@/lib/auth/registration'

// Actions serveur appelées directement : base, en-têtes, session et redirection remplacés.
const ctx = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }) }))
vi.mock('@/lib/auth/session', () => ({ setStudentSession: vi.fn(), requireStudent: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

const { checkStudentEmail, registerStudent } = await import('@/app/(eleve)/actions')

const form = (email: string, password = 'mot-de-passe-1') => {
  const f = new FormData()
  f.set('email', email); f.set('password', password); f.set('confirm', password)
  return f
}

afterEach(() => vi.unstubAllEnvs())

describe('inscription des élèves fermée (en ligne)', () => {
  it('fermée sans STUDENT_REGISTRATION_OPEN, ouverte avec 1', () => {
    vi.stubEnv('STUDENT_REGISTRATION_OPEN', '')
    expect(studentRegistrationOpen()).toBe(false)
    vi.stubEnv('STUDENT_REGISTRATION_OPEN', '1')
    expect(studentRegistrationOpen()).toBe(true)
  })

  it('registerStudent refuse sans créer de compte', async () => {
    vi.stubEnv('STUDENT_REGISTRATION_OPEN', '')
    ctx.db = await testDb()
    expect(await registerStudent(null, form('alice.exemple@malraux-rabat.org'))).toEqual({ error: REGISTRATION_CLOSED })
    expect(REGISTRATION_CLOSED).toBe('Les inscriptions des élèves ne sont pas encore ouvertes.')
    expect(await findStudentByEmail(ctx.db as never, 'alice.exemple@malraux-rabat.org')).toBeNull()
  })

  it("checkStudentEmail : même réponse neutre, qu'un compte existe ou non", async () => {
    vi.stubEnv('STUDENT_REGISTRATION_OPEN', '')
    const db = await testDb()
    ctx.db = db
    await createStudent(db, { email: 'bob.modele@malraux-rabat.org', passwordHash: 'h' })
    expect(await checkStudentEmail('alice.exemple@malraux-rabat.org')).toEqual({ status: 'closed' })
    expect(await checkStudentEmail('bob.modele@malraux-rabat.org')).toEqual({ status: 'closed' })
    expect(await checkStudentEmail('pas-une-adresse')).toEqual({ status: 'invalid' })
  })

  it('ouverte : comportement habituel (nouvelle adresse, compte existant, création)', async () => {
    vi.stubEnv('STUDENT_REGISTRATION_OPEN', '1')
    const db = await testDb()
    ctx.db = db
    await createStudent(db, { email: 'bob.modele@malraux-rabat.org', passwordHash: 'h' })
    expect(await checkStudentEmail('alice.exemple@malraux-rabat.org')).toEqual({ status: 'new' })
    expect(await checkStudentEmail('bob.modele@malraux-rabat.org')).toEqual({ status: 'known' })
    await expect(registerStudent(null, form('alice.exemple@malraux-rabat.org'))).rejects.toThrow('NEXT_REDIRECT')
    expect(await findStudentByEmail(db, 'alice.exemple@malraux-rabat.org')).not.toBeNull()
  })
})
