import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { DB } from './client'
import { classes, classStudents, progress, students, teachers, type ProgressStatus } from './schema'
import type { ParcoursItem } from './activities'
import { listClassAssignments } from './assignments'
import { normalizeEmail } from '@/lib/auth/validation'
import type { Level } from '@/lib/levels'

export type ClassRow = typeof classes.$inferSelect
export type ClassSummary = ClassRow & { studentCount: number }
export type ClassMember = { email: string; student: { id: string; firstName: string; lastName: string } | null }
export type GridRow = { member: ClassMember; statuses: Record<string, { status: ProgressStatus; progressId: string }> }

const ownedBy = (teacherId: string, classId: string) => and(eq(classes.id, classId), eq(classes.teacherId, teacherId))

export async function listClassesForTeacher(db: DB, teacherId: string): Promise<ClassSummary[]> {
  return (await db.select({ c: classes, n: count(classStudents.studentEmail) }).from(classes)
    .leftJoin(classStudents, eq(classStudents.classId, classes.id))
    .where(eq(classes.teacherId, teacherId)).groupBy(classes.id).orderBy(asc(classes.name)))
    .map((r) => ({ ...r.c, studentCount: r.n }))
}

export async function createClass(db: DB, teacherId: string, input: { name: string; level: Level }): Promise<ClassRow> {
  const [row] = await db.insert(classes).values({ teacherId, name: input.name.trim(), level: input.level }).returning()
  return row
}

export async function updateClass(db: DB, teacherId: string, classId: string, input: { name: string; level: Level }): Promise<boolean> {
  return (await db.update(classes).set({ name: input.name.trim(), level: input.level }).where(ownedBy(teacherId, classId))
    .returning({ id: classes.id })).length === 1
}

export async function deleteClass(db: DB, teacherId: string, classId: string): Promise<boolean> {
  return (await db.delete(classes).where(ownedBy(teacherId, classId)).returning({ id: classes.id })).length === 1
}

export async function getClassForTeacher(db: DB, teacherId: string, classId: string): Promise<ClassRow | null> {
  const [row] = await db.select().from(classes).where(ownedBy(teacherId, classId)).limit(1)
  return row ?? null
}

export async function addEmailsToClass(db: DB, classId: string, emails: string[]): Promise<{ added: string[]; already: string[] }> {
  const added: string[] = []
  const already: string[] = []
  for (const raw of emails) {
    const studentEmail = normalizeEmail(raw)
    const inserted = (await db.insert(classStudents).values({ classId, studentEmail }).onConflictDoNothing()
      .returning({ email: classStudents.studentEmail })).length === 1
    ;(inserted ? added : already).push(studentEmail)
  }
  return { added, already }
}

export async function removeEmailFromClass(db: DB, classId: string, email: string): Promise<void> {
  await db.delete(classStudents).where(and(eq(classStudents.classId, classId), eq(classStudents.studentEmail, normalizeEmail(email))))
}

export async function listClassMembers(db: DB, classId: string): Promise<ClassMember[]> {
  return (await db.select({
    email: classStudents.studentEmail,
    id: students.id, firstName: students.firstName, lastName: students.lastName,
  }).from(classStudents).leftJoin(students, eq(students.email, classStudents.studentEmail))
    .where(eq(classStudents.classId, classId)).orderBy(asc(classStudents.studentEmail)))
    .map((r) => ({
      email: r.email,
      student: r.id ? { id: r.id, firstName: r.firstName!, lastName: r.lastName! } : null,
    }))
}

/** L'adresse figure-t-elle dans au moins une liste de classe ? Casse ignorée (anciennes lignes saisies telles quelles). */
export async function isEmailInAnyClass(db: DB, email: string): Promise<boolean> {
  return (await db.select({ email: classStudents.studentEmail }).from(classStudents)
    .where(eq(sql`lower(${classStudents.studentEmail})`, normalizeEmail(email))).limit(1)).length === 1
}

export async function studentClasses(db: DB, studentEmail: string): Promise<{ id: string; name: string; level: Level }[]> {
  return db.select({ id: classes.id, name: classes.name, level: classes.level }).from(classStudents)
    .innerJoin(classes, eq(classes.id, classStudents.classId))
    .where(eq(classStudents.studentEmail, normalizeEmail(studentEmail))).orderBy(asc(classes.name))
}

/** Un enseignant ne voit que les élèves dont l'e-mail figure dans une de ses classes ; l'admin les voit tous. */
export async function teacherCanSeeStudent(db: DB, teacherId: string, studentId: string): Promise<boolean> {
  // L'admin a la vue globale de tous les élèves (spec §6.3).
  const [teacher] = await db.select({ role: teachers.role }).from(teachers).where(and(eq(teachers.id, teacherId), eq(teachers.isActive, true))).limit(1)
  if (teacher?.role === 'admin') return (await db.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1)).length > 0
  return (await db.select({ id: students.id }).from(students)
    .innerJoin(classStudents, eq(classStudents.studentEmail, students.email))
    .innerJoin(classes, eq(classes.id, classStudents.classId))
    .where(and(eq(students.id, studentId), eq(classes.teacherId, teacherId))).limit(1)).length > 0
}

export async function classGrid(db: DB, classRow: ClassRow): Promise<{ activities: ParcoursItem[]; rows: GridRow[] }> {
  const activities: ParcoursItem[] = (await listClassAssignments(db, classRow.id))
    .filter((a) => a.status === 'published')
    .map((a, i) => ({ activityId: a.activityId, title: a.title, thumbnail: null, section: 'defis' as const, number: i + 1 }))
  const members = await listClassMembers(db, classRow.id)
  const ids = members.flatMap((m) => (m.student ? [m.student.id] : []))
  const rows = ids.length === 0 ? [] : await db.select({
    studentId: progress.studentId, activityId: progress.activityId, status: progress.status, progressId: progress.id,
  }).from(progress).where(inArray(progress.studentId, ids))
  return {
    activities,
    rows: members.map((member) => ({
      member,
      statuses: Object.fromEntries(rows.filter((r) => r.studentId === member.student?.id)
        .map((r) => [r.activityId, { status: r.status, progressId: r.progressId }])),
    })),
  }
}
