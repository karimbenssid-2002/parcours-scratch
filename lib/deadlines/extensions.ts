import { and, eq, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { classActivities, classes, classStudents, deadlineExtensions, progress, students, teachers } from '@/lib/db/schema'
import { teacherCanSeeStudent } from '@/lib/db/classes'
import { now } from '@/lib/clock'

/**
 * Le défi est-il donné à l'élève par une classe de cet enseignant ? (L'admin : par n'importe quelle classe.)
 * Sans cela, un enseignant qui a l'élève dans sa classe pourrait repousser l'échéance fixée par un collègue.
 */
export async function givesActivityTo(db: DB, teacherId: string, studentId: string, activityId: string): Promise<boolean> {
  const [teacher] = await db.select({ role: teachers.role }).from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  const isAdmin = teacher?.role === 'admin'
  return (await db.select({ id: classes.id }).from(classActivities)
    .innerJoin(classes, eq(classes.id, classActivities.classId))
    .innerJoin(classStudents, eq(classStudents.classId, classes.id))
    .innerJoin(students, eq(students.email, classStudents.studentEmail))
    .where(and(eq(classActivities.activityId, activityId), eq(students.id, studentId), isAdmin ? undefined : eq(classes.teacherId, teacherId)))
    .limit(1)).length > 0
}

/** Nouvelle échéance pour un élève ; rouvre un défi « Non rendu ». */
export async function grantExtension(db: DB, teacherId: string, studentId: string, activityId: string, dueAt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await teacherCanSeeStudent(db, teacherId, studentId))) return { ok: false, error: 'Élève introuvable.' }
  if (!(await givesActivityTo(db, teacherId, studentId, activityId))) return { ok: false, error: 'Ce défi n’est donné à cet élève par aucune de vos classes.' }
  if (!(Date.parse(dueAt) > now().getTime())) return { ok: false, error: 'La nouvelle date limite doit être dans le futur.' }
  await db.transaction(async (tx) => {
    await tx.insert(deadlineExtensions).values({ studentId, activityId, dueAt, grantedBy: teacherId })
      .onConflictDoUpdate({ target: [deadlineExtensions.studentId, deadlineExtensions.activityId], set: { dueAt, grantedBy: teacherId } })
    await tx.update(progress).set({
      closedDueAt: null,
      status: sql`case when ${progress.status} = 'not_submitted'
        then (case when ${progress.projectPath} is null then 'not_started' else 'in_progress' end) else ${progress.status} end`,
    }).where(and(eq(progress.studentId, studentId), eq(progress.activityId, activityId)))
  })
  return { ok: true }
}
