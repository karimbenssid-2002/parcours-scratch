import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities, lateNotices, progress, students } from '@/lib/db/schema'
import { now } from '@/lib/clock'

export type LateNotice = {
  id: string; kind: 'auto_submitted' | 'not_submitted'; dueAt: string; progressId: string
  studentId: string; studentName: string; activityTitle: string; classNames: string
}

export async function listUnseenNotices(db: DB, teacherId: string): Promise<LateNotice[]> {
  return (await db.select({
    id: lateNotices.id, kind: lateNotices.kind, dueAt: lateNotices.dueAt, progressId: lateNotices.progressId,
    studentId: students.id, firstName: students.firstName, lastName: students.lastName, activityTitle: activities.title,
    classNames: sql<string>`(select string_agg(c.name, ', ') from classes c join class_students cs on cs.class_id = c.id
      where c.teacher_id = ${teacherId} and cs.student_email = ${students.email})`,
  }).from(lateNotices)
    .innerJoin(progress, eq(progress.id, lateNotices.progressId))
    .innerJoin(students, eq(students.id, progress.studentId))
    .innerJoin(activities, eq(activities.id, progress.activityId))
    .where(and(eq(lateNotices.teacherId, teacherId), isNull(lateNotices.seenAt)))
    .orderBy(asc(lateNotices.dueAt), asc(students.lastName)))
    .map(({ firstName, lastName, ...r }) => ({ ...r, classNames: r.classNames ?? '', studentName: `${firstName} ${lastName}` }))
}

export async function countUnseenNotices(db: DB, teacherId: string): Promise<number> {
  return (await listUnseenNotices(db, teacherId)).length
}

export async function markNoticeSeen(db: DB, teacherId: string, noticeId: string): Promise<boolean> {
  return (await db.update(lateNotices).set({ seenAt: now().toISOString() })
    .where(and(eq(lateNotices.id, noticeId), eq(lateNotices.teacherId, teacherId), isNull(lateNotices.seenAt)))
    .returning({ id: lateNotices.id })).length === 1

}
