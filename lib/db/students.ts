import { asc, eq } from 'drizzle-orm'
import { isUniqueViolation, type DB } from './client'
import { classes, classStudents, students } from './schema'
import { namesFromEmail, normalizeEmail } from '@/lib/auth/validation'
import type { Level } from '@/lib/levels'
import { fold } from '@/lib/text'

export type Student = typeof students.$inferSelect

export class StudentExistsError extends Error {
  constructor() {
    super('Un compte existe déjà pour cet e-mail.')
  }
}

export async function findStudentByEmail(db: DB, email: string): Promise<Student | null> {
  const [row] = await db.select().from(students).where(eq(students.email, normalizeEmail(email))).limit(1)
  return row ?? null
}

export async function findStudentById(db: DB, id: string): Promise<Student | null> {
  const [row] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  return row ?? null
}

export async function createStudent(db: DB, input: { email: string; passwordHash: string }): Promise<Student> {
  const email = normalizeEmail(input.email)
  if (await findStudentByEmail(db, email)) throw new StudentExistsError()
  try {
    const [row] = await db.insert(students)
      .values({ email, ...namesFromEmail(email), passwordHash: input.passwordHash })
      .returning()
    return row
  } catch (e) {
    // course entre deux onglets : la contrainte UNIQUE tranche
    if (isUniqueViolation(e)) throw new StudentExistsError()
    throw e
  }
}

export async function setStudentPassword(db: DB, id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
  await db.update(students).set({ passwordHash, mustChangePassword }).where(eq(students.id, id))
}

export async function touchStudentLogin(db: DB, id: string): Promise<void> {
  await db.update(students).set({ lastLoginAt: new Date().toISOString() }).where(eq(students.id, id))
}

export type AdminStudentRow = { id: string; email: string; firstName: string; lastName: string; levels: Level[]; classes: string[]; lastLoginAt: string | null }

export async function listAllStudents(db: DB, filter: { q?: string; level?: Level }): Promise<AdminStudentRow[]> {
  // Recherche faite ici (et non en SQL) : casse et accents repliés comme partout ailleurs (« Élise »).
  const q = fold(filter.q?.trim() ?? '')
  const rows = (await db.select().from(students)
    .orderBy(asc(students.lastName), asc(students.firstName)))
    .filter((s) => !q || [s.email, s.firstName, s.lastName, `${s.firstName} ${s.lastName}`].some((v) => fold(v).includes(q)))
  // Le niveau d'un élève est celui de ses classes (il ne le choisit plus).
  const memberships = await db.select({ email: classStudents.studentEmail, name: classes.name, level: classes.level }).from(classStudents)
    .innerJoin(classes, eq(classes.id, classStudents.classId))
  return rows.map((s) => {
    const mine = memberships.filter((m) => m.email === s.email)
    return {
      id: s.id, email: s.email, firstName: s.firstName, lastName: s.lastName, lastLoginAt: s.lastLoginAt,
      classes: mine.map((m) => m.name).sort(), levels: [...new Set(mine.map((m) => m.level))].sort(),
    }
  }).filter((r) => !filter.level || r.levels.includes(filter.level))
}
