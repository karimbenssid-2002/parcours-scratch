import { asc, eq } from 'drizzle-orm'
import type { DB } from './client'
import { teachers } from './schema'
import { normalizeEmail } from '@/lib/auth/validation'

export type Teacher = typeof teachers.$inferSelect
export type NewTeacher = typeof teachers.$inferInsert

async function findTeacherWhere(db: DB, where: ReturnType<typeof eq>): Promise<Teacher | null> {
  const [row] = await db.select().from(teachers).where(where).limit(1)
  return row ?? null
}

export async function findTeacherByUsername(db: DB, username: string): Promise<Teacher | null> {
  return findTeacherWhere(db, eq(teachers.username, username.trim().toLowerCase()))
}

export async function findTeacherByEmail(db: DB, email: string): Promise<Teacher | null> {
  return findTeacherWhere(db, eq(teachers.email, normalizeEmail(email)))
}

export async function findTeacherById(db: DB, id: string): Promise<Teacher | null> {
  return findTeacherWhere(db, eq(teachers.id, id))
}

export async function createTeacher(db: DB, t: NewTeacher): Promise<Teacher> {
  const [row] = await db.insert(teachers)
    .values({ ...t, email: normalizeEmail(t.email), username: t.username.trim().toLowerCase() })
    .returning()
  return row
}

/** prenom.nom, puis prenom.nom2, prenom.nom3… si déjà pris. */
export async function buildUniqueUsername(db: DB, email: string): Promise<string> {
  const base = normalizeEmail(email).split('@')[0]
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}${n}`
    if (!(await findTeacherByUsername(db, candidate))) return candidate
  }
  throw new Error('Impossible de générer un identifiant unique')
}

export async function setTeacherPassword(db: DB, id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
  await db.update(teachers).set({ passwordHash, mustChangePassword }).where(eq(teachers.id, id))
}

export async function touchTeacherLogin(db: DB, id: string): Promise<void> {
  await db.update(teachers).set({ lastLoginAt: new Date().toISOString() }).where(eq(teachers.id, id))
}

export async function listTeachers(db: DB): Promise<Teacher[]> {
  return db.select().from(teachers).orderBy(asc(teachers.lastName), asc(teachers.firstName))
}

export async function setTeacherActive(db: DB, id: string, isActive: boolean): Promise<void> {
  await db.update(teachers).set({ isActive }).where(eq(teachers.id, id))
}
