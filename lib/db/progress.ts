import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DB } from './client'
import { activities, progress, reviews, teachers, type ProgressStatus, type ReviewDecision } from './schema'
import { EDITABLE_STATUSES, SUBMITTABLE_STATUSES } from '@/lib/progress/rules'

export type Progress = typeof progress.$inferSelect
export type LatestReview = { decision: ReviewDecision; comment: string | null; createdAt: string; teacherName: string }

const whereRow = (studentId: string, activityId: string) =>
  and(eq(progress.studentId, studentId), eq(progress.activityId, activityId))

export async function getProgress(db: DB, studentId: string, activityId: string): Promise<Progress | null> {
  const [row] = await db.select().from(progress).where(whereRow(studentId, activityId)).limit(1)
  return row ?? null
}

export async function progressByActivity(db: DB, studentId: string): Promise<Map<string, ProgressStatus>> {
  const rows = await db.select({ activityId: progress.activityId, status: progress.status }).from(progress)
    .where(eq(progress.studentId, studentId))
  return new Map(rows.map((r) => [r.activityId, r.status]))
}

/** Enregistre une sauvegarde. false si le défi n'est plus modifiable (soumis ou validé entre-temps). */
export async function recordSave(db: DB, studentId: string, activityId: string, projectPath: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.insert(progress).values({ studentId, activityId }).onConflictDoNothing()
    const updated = await tx.update(progress)
      .set({
        projectPath,
        updatedAt: new Date().toISOString(),
        status: sql`case when ${progress.status} = 'not_started' then 'in_progress' else ${progress.status} end`,
      })
      .where(and(whereRow(studentId, activityId), inArray(progress.status, [...EDITABLE_STATUSES])))
      .returning({ id: progress.id })
    return updated.length === 1
  })
}

export async function submitProgress(db: DB, studentId: string, activityId: string): Promise<boolean> {
  const now = new Date().toISOString()
  return (await db.update(progress).set({ status: 'submitted', submittedAt: now, updatedAt: now })
    .where(and(whereRow(studentId, activityId), inArray(progress.status, [...SUBMITTABLE_STATUSES]), isNotNull(progress.projectPath)))
    .returning({ id: progress.id })).length === 1
}

/** Oublie le travail de l'élève (le fichier est supprimé par l'appelant). */
export async function restartProgress(db: DB, studentId: string, activityId: string): Promise<{ ok: boolean; previousPath: string | null }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(progress).where(whereRow(studentId, activityId)).limit(1)
    if (!row) return { ok: true, previousPath: null }
    if (!(EDITABLE_STATUSES as readonly ProgressStatus[]).includes(row.status)) return { ok: false, previousPath: null }
    await tx.update(progress).set({ projectPath: null, updatedAt: new Date().toISOString() }).where(eq(progress.id, row.id))
    return { ok: true, previousPath: row.projectPath }
  })
}

export async function latestReview(db: DB, progressId: string): Promise<LatestReview | null> {
  const [row] = await db.select({
    decision: reviews.decision, comment: reviews.comment, createdAt: reviews.createdAt,
    firstName: teachers.firstName, lastName: teachers.lastName,
  }).from(reviews).innerJoin(teachers, eq(reviews.teacherId, teachers.id))
    .where(eq(reviews.progressId, progressId)).orderBy(desc(reviews.createdAt)).limit(1)
  if (!row) return null
  return { decision: row.decision, comment: row.comment, createdAt: row.createdAt, teacherName: `${row.firstName} ${row.lastName}` }
}

export type RecentReview = { activityId: string; title: string; decision: ReviewDecision; comment: string; createdAt: string; teacherName: string }

/** Derniers commentaires reçus par l'élève sur ses défis encore attribués (accueil élève) : comme `latestReview`,
 *  seule la dernière décision de chaque défi compte (une validation sans commentaire masque l'ancien retour). */
export async function recentReviewsForStudent(db: DB, studentId: string, activityIds: string[], limit = 5): Promise<RecentReview[]> {
  if (activityIds.length === 0) return []
  const latest = sql`${reviews.createdAt} = (select max(r2.created_at) from reviews r2 where r2.progress_id = ${reviews.progressId})`
  return (await db.select({
    activityId: progress.activityId, title: activities.title, decision: reviews.decision, comment: reviews.comment,
    createdAt: reviews.createdAt, firstName: teachers.firstName, lastName: teachers.lastName,
  }).from(reviews)
    .innerJoin(progress, eq(reviews.progressId, progress.id))
    .innerJoin(activities, eq(activities.id, progress.activityId))
    .innerJoin(teachers, eq(reviews.teacherId, teachers.id))
    .where(and(eq(progress.studentId, studentId), inArray(progress.activityId, activityIds), latest,
      isNotNull(reviews.comment), sql`trim(${reviews.comment}) <> ''`))
    .orderBy(desc(reviews.createdAt)).limit(limit))
    .map(({ firstName, lastName, comment, ...r }) => ({ ...r, comment: comment ?? '', teacherName: `${firstName} ${lastName}` }))
}
