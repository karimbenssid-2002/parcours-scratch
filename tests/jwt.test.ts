import { afterEach, describe, expect, it } from 'vitest'
import { signAdmin, signStudent, verifyAdmin, verifyStudent } from '@/lib/auth/jwt'

const admin = { teacherId: 't1', username: 'emma.test', role: 'prof' as const }
const student = { studentId: 's1' }

describe('jwt', () => {
  it('signe et vérifie une session enseignant', async () => {
    expect(await verifyAdmin(await signAdmin(admin))).toEqual(admin)
  })

  it('signe et vérifie une session élève', async () => {
    expect(await verifyStudent(await signStudent(student))).toEqual(student)
  })

  it("n'accepte pas un jeton élève comme jeton enseignant (et inversement)", async () => {
    expect(await verifyAdmin(await signStudent(student))).toBeNull()
    expect(await verifyStudent(await signAdmin(admin))).toBeNull()
  })

  it('rejette un jeton falsifié', async () => {
    const token = await signAdmin(admin)
    expect(await verifyAdmin(token.slice(0, -2) + 'xx')).toBeNull()
    expect(await verifyAdmin('nimporte-quoi')).toBeNull()
  })

  describe('secrets', () => {
    const saved = process.env.AUTH_SECRET
    afterEach(() => { process.env.AUTH_SECRET = saved })
    it("refuse les secrets d'exemple de .env.example (sinon n'importe qui pourrait forger une session admin)", async () => {
      process.env.AUTH_SECRET = 'remplacer-par-une-longue-chaine-aleatoire-admin'
      await expect(signAdmin(admin)).rejects.toThrow(/AUTH_SECRET/)
    })
  })
})
