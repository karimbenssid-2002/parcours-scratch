import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import {
  buildUniqueUsername, createTeacher, findTeacherByEmail, findTeacherByUsername, setTeacherActive,
} from '@/lib/db/teachers'
import { createTeacherRequest, listPendingRequests } from '@/lib/db/teacher-requests'
import { approveTeacherRequest } from '@/lib/auth/teacher-approval'
import { verifyPassword } from '@/lib/auth/password'

const base = { firstName: 'Emma', lastName: 'Test', passwordHash: 'x', role: 'prof' as const }

describe('enseignants', () => {
  it('retrouve un compte sans tenir compte de la casse', async () => {
    const db = await testDb()
    await createTeacher(db, { ...base, email: 'Emma.Test@malraux-rabat.org', username: 'Emma.Test' })
    expect((await findTeacherByUsername(db, ' EMMA.test '))?.email).toBe('emma.test@malraux-rabat.org')
    expect(await findTeacherByEmail(db, 'EMMA.TEST@MALRAUX-RABAT.ORG')).not.toBeNull()
  })

  it('génère un identifiant unique', async () => {
    const db = await testDb()
    expect(await buildUniqueUsername(db, 'emma.test@malraux-rabat.org')).toBe('emma.test')
    await createTeacher(db, { ...base, email: 'emma.test@malraux-rabat.org', username: 'emma.test' })
    expect(await buildUniqueUsername(db, 'emma.test@malraux-rabat.org')).toBe('emma.test2')
  })

  it('désactive un compte', async () => {
    const db = await testDb()
    const t = await createTeacher(db, { ...base, email: 'a.b@malraux-rabat.org', username: 'a.b' })
    await setTeacherActive(db, t.id, false)
    expect((await findTeacherByUsername(db, 'a.b'))?.isActive).toBe(false)
  })
})

describe('demandes et validation', () => {
  it('ne crée pas deux demandes en attente identiques', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'registration', 'emma.test@malraux-rabat.org')
    await createTeacherRequest(db, 'registration', ' Emma.Test@malraux-rabat.org')
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('deux demandes simultanées identiques ne créent qu’une demande en attente', async () => {
    const db = await testDb()
    await Promise.all([
      createTeacherRequest(db, 'registration', 'emma.test@malraux-rabat.org'),
      createTeacherRequest(db, 'registration', 'emma.test@malraux-rabat.org'),
    ])
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('valide une inscription : compte prof, mot de passe provisoire, changement forcé', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'registration', 'marie-anne.el-fictif@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const res = await approveTeacherRequest(db, req.id)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const t = await findTeacherByUsername(db, res.username)
    expect(t).toMatchObject({ role: 'prof', mustChangePassword: true, firstName: 'Marie-Anne', lastName: 'El-Fictif' })
    expect(await verifyPassword(res.password, t!.passwordHash)).toBe(true)
    expect(await listPendingRequests(db)).toHaveLength(0)
  })

  it('refuse de valider deux fois la même demande', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'registration', 'emma.test@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    await approveTeacherRequest(db, req.id)
    expect(await approveTeacherRequest(db, req.id)).toEqual({ ok: false, error: 'Demande introuvable ou déjà traitée.' })
  })

  it('réinitialise le mot de passe d’un compte existant', async () => {
    const db = await testDb()
    await createTeacher(db, { ...base, email: 'emma.test@malraux-rabat.org', username: 'emma.test', mustChangePassword: false })
    await createTeacherRequest(db, 'reset', 'emma.test@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const res = await approveTeacherRequest(db, req.id)
    expect(res).toMatchObject({ ok: true, username: 'emma.test' })
    expect((await findTeacherByUsername(db, 'emma.test'))?.mustChangePassword).toBe(true)
  })

  it('échoue proprement sur une réinitialisation sans compte', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'reset', 'inconnu.prof@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    expect(await approveTeacherRequest(db, req.id)).toEqual({ ok: false, error: 'Aucun compte pour cet e-mail.' })
  })

  it('deux validations simultanées : une seule réussit, l’autre échoue proprement (inscription)', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'registration', 'emma.test@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const results = await Promise.all([approveTeacherRequest(db, req.id), approveTeacherRequest(db, req.id)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'Demande introuvable ou déjà traitée.' })
  })

  it('deux validations simultanées : un seul mot de passe provisoire émis (réinitialisation)', async () => {
    const db = await testDb()
    await createTeacher(db, { ...base, email: 'emma.test@malraux-rabat.org', username: 'emma.test', mustChangePassword: false })
    await createTeacherRequest(db, 'reset', 'emma.test@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const results = await Promise.all([approveTeacherRequest(db, req.id), approveTeacherRequest(db, req.id)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })
})
