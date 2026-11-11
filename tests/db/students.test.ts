import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createStudent, findStudentByEmail, StudentExistsError } from '@/lib/db/students'

describe('élèves', () => {
  it('crée un élève en déduisant son nom, retrouvé malgré la casse', async () => {
    const db = await testDb()
    const s = await createStudent(db, { email: ' Alice.Exemple@malraux-rabat.org', passwordHash: 'h' })
    expect(s).toMatchObject({ email: 'alice.exemple@malraux-rabat.org', firstName: 'Alice', lastName: 'Exemple', mustChangePassword: false })
    expect((await findStudentByEmail(db, 'ALICE.EXEMPLE@malraux-rabat.org'))?.id).toBe(s.id)
  })

  it('refuse un deuxième compte pour le même e-mail', async () => {
    const db = await testDb()
    await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
    await expect(createStudent(db, { email: 'Alice.Exemple@malraux-rabat.org', passwordHash: 'h' }))
      .rejects.toBeInstanceOf(StudentExistsError)
  })
})
