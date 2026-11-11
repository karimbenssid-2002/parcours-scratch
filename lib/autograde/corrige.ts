import { and, eq, isNotNull } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities, activityAutograde, classActivities, classStudents, students, teachers } from '@/lib/db/schema'

/** Partage (ou non) le corrigé d'un défi avec une classe. L'appelant vérifie que la classe appartient au professeur. */
export async function setSolutionShared(db: DB, classId: string, activityId: string, shared: boolean): Promise<boolean> {
  return (await db.update(classActivities).set({ solutionShared: shared })
    .where(and(eq(classActivities.classId, classId), eq(classActivities.activityId, activityId)))
    .returning({ activityId: classActivities.activityId })).length === 1
}

const hasSolution = async (db: DB, activityId: string) =>
  (await db.select({ id: activityAutograde.activityId }).from(activityAutograde)
    .where(and(eq(activityAutograde.activityId, activityId), isNotNull(activityAutograde.solutionPath))).limit(1)).length > 0

/** Corrigé visible : par tout enseignant actif, ou par un élève dont une classe l'a partagé (défi publié). */
export async function canSeeSolution(db: DB, who: { studentId: string } | { teacherId: string }, activityId: string): Promise<boolean> {
  if (!(await hasSolution(db, activityId))) return false
  if ('teacherId' in who)
    return (await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, who.teacherId), eq(teachers.isActive, true))).limit(1)).length > 0
  return (await db.select({ id: students.id }).from(students)
    .innerJoin(classStudents, eq(classStudents.studentEmail, students.email))
    .innerJoin(classActivities, and(eq(classActivities.classId, classStudents.classId), eq(classActivities.activityId, activityId), eq(classActivities.solutionShared, true)))
    .innerJoin(activities, and(eq(activities.id, classActivities.activityId), eq(activities.status, 'published')))
    .where(eq(students.id, who.studentId)).limit(1)).length > 0

}
