import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher, findTeacherByEmail, findTeacherByUsername, findTeachersByIdentity, setTeacherActive } from '@/lib/db/teachers'
import { createTeacherRequest, listPendingRequests } from '@/lib/db/teacher-requests'
import { approveTeacherRequest } from '@/lib/auth/teacher-approval'

const base = { firstName: 'Emma', lastName: 'Test', role: 'prof' as const }

describe('enseignants', () => {
  it('retrouve un compte sans tenir compte de la casse', async () => {
    const db = await testDb()
    await createTeacher(db, { ...base, email: 'Emma.Test@malraux-rabat.org', username: 'Emma.Test' })
    expect((await findTeacherByUsername(db, ' EMMA.test '))?.email).toBe('emma.test@malraux-rabat.org')
    expect(await findTeacherByEmail(db, 'EMMA.TEST@MALRAUX-RABAT.ORG')).not.toBeNull()
  })

  it("retrouve les comptes d'une identité par l'adresse enregistrée, quel que soit le domaine", async () => {
    const db = await testDb()
    const t = await createTeacher(db, { ...base, email: 'emma.test@mlfmonde.org', username: 'emma.test2' })
    expect((await findTeachersByIdentity(db, 'emma.test')).map((r) => r.id)).toEqual([t.id])
    expect(await findTeachersByIdentity(db, 'emma.test2')).toEqual([])
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
    expect(await createTeacherRequest(db, 'emma.test@malraux-rabat.org')).toBe('created')
    expect(await createTeacherRequest(db, ' Emma.Test@malraux-rabat.org')).toBe('duplicate')
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('deux demandes simultanées identiques ne créent qu’une demande en attente', async () => {
    const db = await testDb()
    await Promise.all([
      createTeacherRequest(db, 'emma.test@malraux-rabat.org'),
      createTeacherRequest(db, 'emma.test@malraux-rabat.org'),
    ])
    expect(await listPendingRequests(db)).toHaveLength(1)
  })

  it('valide une inscription : compte prof sans mot de passe, noms tirés de l’adresse', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'marie-anne.el-fictif@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    const res = await approveTeacherRequest(db, req.id)
    expect(res).toEqual({ ok: true, username: 'marie-anne.el-fictif' })
    expect(await findTeacherByUsername(db, 'marie-anne.el-fictif')).toMatchObject({ role: 'prof', firstName: 'Marie-Anne', lastName: 'El-Fictif' })
    expect(await listPendingRequests(db)).toHaveLength(0)
  })

  it('refuse de valider deux fois la même demande', async () => {
    const db = await testDb()
    await createTeacherRequest(db, 'emma.test@malraux-rabat.org')
    const [req] = await listPendingRequests(db)
    await approveTeacherRequest(db, req.id)
    expect(await approveTeacherRequest(db, req.id)).toEqual({ ok: false, error: 'Demande introuvable ou déjà traitée.' })
  })
})
