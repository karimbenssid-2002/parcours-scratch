import { PGlite } from '@electric-sql/pglite'
import { DrizzleQueryError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { notFound, redirect } from 'next/navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DB } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Erreurs imprévues des Server Actions et des requêtes qui portent une adresse : jamais d'adresse dans les journaux
// (le gestionnaire d'erreurs de Next écrirait le message de Drizzle, qui cite les paramètres de la requête).
const ADRESSE = 'zoe.fictive@malraux-rabat.org'
/** Erreur telle que Drizzle la lève : requête, paramètres (l'adresse), et cause du pilote qui la répète. */
const dbError = () => new DrizzleQueryError('insert into "teacher_requests" ("email") values ($1)', [ADRESSE],
  Object.assign(new Error(`duplicate key value violates unique constraint (email)=(${ADRESSE})`), { detail: `Key (email)=(${ADRESSE}) already exists.` }))

const ctx = vi.hoisted(() => ({ fail: true, created: true }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/db/client')>()), getDb: () => ({}) }))
vi.mock('@/lib/auth/limits', () => ({ isBlocked: async () => false }))
vi.mock('@/lib/auth/session', () => ({ requireTeacher: async () => ({ id: 't1', role: 'admin' }) }))
vi.mock('@/lib/email', () => ({ sendEmail: async () => ({ delivered: false }) }))
vi.mock('@/lib/push/schedule', () => ({ schedule: () => {} }))
vi.mock('@/lib/db/teacher-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/teacher-requests')>()),
  createTeacherRequestId: async () => {
    if (ctx.fail) throw dbError()
    return ctx.created ? { status: 'created', id: 'r1' } : { status: 'duplicate' }
  },
}))
vi.mock('@/lib/db/classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/classes')>()),
  getClassForTeacher: async () => ({ id: 'c1' }),
  addEmailsToClass: async () => { throw dbError() },
  removeEmailFromClass: async () => { throw dbError() },
}))

const { safeAction, actionFailed } = await import('@/lib/http/safe-action')
const { withoutPersonalData } = await import('@/lib/db/safe-message')
const { requestTeacherAccess } = await import('@/app/admin/(auth)/actions')
const { addStudentsAction, removeStudentAction } = await import('@/app/admin/(espace)/classes/actions')
const { isEmailInAnyClass } = await import('@/lib/db/classes')

const REQUEST_SENT = "Demande envoyée. Si elle est validée, vous vous connecterez avec Google avec cette adresse. "
  + "Si vous avez déjà un compte, connectez-vous avec l'adresse de ce compte."

let logged: () => string
beforeEach(() => {
  ctx.fail = true
  ctx.created = true
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  logged = () => JSON.stringify([error.mock.calls, warn.mock.calls, log.mock.calls])
})
afterEach(() => { vi.restoreAllMocks() })

const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

describe('safeAction', () => {
  it('erreur imprévue : une ligne de journal sans adresse, puis la réponse générique', async () => {
    const r = await safeAction('essai', async () => { throw dbError() }, () => ({ error: 'générique' }))
    expect(r).toEqual({ error: 'générique' })
    expect(logged()).toContain('[essai]')
    expect(logged()).toContain('[adresse]')
    expect(logged()).not.toContain('@')
  })

  it('redirect() et notFound() traversent sans être journalisés', async () => {
    await expect(safeAction('essai', async () => redirect('/ailleurs'), () => 'x')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) })
    await expect(safeAction('essai', async () => notFound(), () => 'x')).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_HTTP_ERROR_FALLBACK;404/) })
    expect(logged()).toBe('[[],[],[]]')
  })

  it('actionFailed : Error neuve, message générique, sans cause', async () => {
    const e = await safeAction('essai', async () => { throw dbError() }, () => actionFailed('Échec.')).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(Error)
    expect((e as Error).message).toBe('Échec.')
    expect((e as Error).cause).toBeUndefined()
  })
})

describe('withoutPersonalData', () => {
  it('relève une Error neuve : ni paramètres, ni cause, ni detail, aucune adresse', async () => {
    const e = await withoutPersonalData(async () => { throw dbError() }).catch((x: unknown) => x) as Error
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(DrizzleQueryError)
    expect(e.cause).toBeUndefined()
    expect(JSON.stringify([e.message, { ...e }])).not.toContain('@')
    expect(String(e.stack)).not.toContain('@malraux')
  })

  it('isEmailInAnyClass sur une base en échec (tables absentes) : erreur sans l’adresse', async () => {
    const broken = drizzle({ client: new PGlite(), schema }) as unknown as DB
    const e = await isEmailInAnyClass(broken, ADRESSE).catch((x: unknown) => x) as Error
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toMatch(/class_students/)
    expect(`${e.message} ${e.stack}`).not.toContain(ADRESSE)
    expect(e.cause).toBeUndefined()
  }, 30_000)
})

describe('Server Actions portant une adresse', () => {
  it('demande de compte : base en échec → message générique, journal sans adresse', async () => {
    expect(await requestTeacherAccess(null, form({ email: ADRESSE }))).toEqual({ error: "La demande n'a pas pu être envoyée. Réessayez plus tard." })
    expect(logged()).toContain('[demande de compte]')
    expect(logged()).not.toContain('@')
  })

  it('demande de compte : réponse identique et sans promesse, demande créée ou doublon silencieux', async () => {
    ctx.fail = false
    expect(await requestTeacherAccess(null, form({ email: ADRESSE }))).toEqual({ success: REQUEST_SENT })
    ctx.created = false
    expect(await requestTeacherAccess(null, form({ email: 'zoe.fictive@mlfmonde.org' }))).toEqual({ success: REQUEST_SENT })
  })

  it('ajout d’élèves : base en échec → message générique, journal sans adresse', async () => {
    const r = await addStudentsAction('c1', null, form({ emails: `${ADRESSE}\nbob.modele@malraux-rabat.org` }))
    expect(r).toEqual({ added: [], already: [], invalid: [], duplicates: [], error: 'Les adresses n’ont pas pu être ajoutées. Réessayez.' })
    expect(logged()).not.toContain('@')
  })

  it('retrait d’un élève : base en échec → erreur générique levée, journal sans adresse', async () => {
    await expect(removeStudentAction('c1', ADRESSE)).rejects.toThrow('Le retrait a échoué. Réessayez.')
    expect(logged()).not.toContain('@')
  })
})
