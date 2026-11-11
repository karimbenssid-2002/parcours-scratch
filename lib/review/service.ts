import { and, asc, countDistinct, desc, eq } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities, classes, classStudents, progress, reviews, students, teachers, REVIEW_DECISIONS, type ProgressStatus, type ReviewDecision } from '@/lib/db/schema'
import { getActivityDetail, type ActivityDetail } from '@/lib/db/activities'
import { teacherCanSeeStudent } from '@/lib/db/classes'
import { setStudentPassword } from '@/lib/db/students'
import type { Progress } from '@/lib/db/progress'
import { generateProvisionalPassword, hashPassword } from '@/lib/auth/password'
import type { Level } from '@/lib/levels'
import { givesActivityTo, grantExtension } from '@/lib/deadlines/extensions'
import { parseSchoolDateTime } from '@/lib/deadlines/time'
import { now } from '@/lib/clock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COMMENT = 2000

export type QueueItem = { progressId: string; studentId: string; studentName: string; activityId: string; activityTitle: string; submittedAt: string; autoSubmitted: boolean }
// automatic / verifiedByName : réservés aux professeurs (jamais montrés à l'élève).
export type ReviewEntry = { decision: ReviewDecision; comment: string | null; createdAt: string; teacherName: string; automatic: boolean; verifiedByName: string | null }
type StudentInfo = { id: string; email: string; firstName: string; lastName: string; levels: Level[] }
export type ReviewView = { progress: Progress; student: StudentInfo; activity: ActivityDetail; history: ReviewEntry[] }
export type StudentOverview = {
  student: StudentInfo
  items: { progressId: string; activityId: string; activityTitle: string; status: ProgressStatus; updatedAt: string }[]
}

async function studentInfo(db: DB, studentId: string): Promise<StudentInfo | undefined> {
  const [s] = await db.select({ id: students.id, email: students.email, firstName: students.firstName, lastName: students.lastName })
    .from(students).where(eq(students.id, studentId)).limit(1)
  if (!s) return undefined
  // Niveaux de ses classes (l'élève ne choisit plus son niveau).
  const levels = (await db.selectDistinct({ level: classes.level }).from(classStudents)
    .innerJoin(classes, eq(classes.id, classStudents.classId)).where(eq(classStudents.studentEmail, s.email))).map((r) => r.level)
  return { ...s, levels }
}

export type ClassPending = { classId: string; name: string; level: Level; pending: number }

/**
 * Défis soumis des élèves de ses classes, plus ancien d'abord (un élève dans deux classes n'apparaît qu'une fois).
 * Avec `classId`, seulement ceux de cette classe (vide si elle n'appartient pas à l'enseignant).
 */
export async function reviewQueue(db: DB, teacherId: string, classId?: string): Promise<QueueItem[]> {
  return (await db.selectDistinct({
    progressId: progress.id, studentId: students.id, firstName: students.firstName, lastName: students.lastName,
    activityId: activities.id, activityTitle: activities.title, submittedAt: progress.submittedAt, autoSubmittedAt: progress.autoSubmittedAt,
  }).from(progress)
    .innerJoin(students, eq(students.id, progress.studentId))
    .innerJoin(classStudents, eq(classStudents.studentEmail, students.email))
    .innerJoin(classes, and(eq(classes.id, classStudents.classId), eq(classes.teacherId, teacherId)))
    .innerJoin(activities, eq(activities.id, progress.activityId))
    .where(classId ? and(eq(progress.status, 'submitted'), eq(classes.id, classId)) : eq(progress.status, 'submitted'))
    .orderBy(asc(progress.submittedAt)))
    .map((r) => ({
      progressId: r.progressId, studentId: r.studentId, studentName: `${r.firstName} ${r.lastName}`,
      activityId: r.activityId, activityTitle: r.activityTitle, submittedAt: r.submittedAt ?? '', autoSubmitted: r.autoSubmittedAt !== null,
    }))
}

/** Taille de la file de `reviewQueue` (pastille du menu), comptée par la base sans charger les lignes. */
export async function countReviewQueue(db: DB, teacherId: string): Promise<number> {
  const [row] = await db.select({ n: countDistinct(progress.id) }).from(progress)
    .innerJoin(students, eq(students.id, progress.studentId))
    .innerJoin(classStudents, eq(classStudents.studentEmail, students.email))
    .innerJoin(classes, and(eq(classes.id, classStudents.classId), eq(classes.teacherId, teacherId)))
    .innerJoin(activities, eq(activities.id, progress.activityId))
    .where(eq(progress.status, 'submitted'))
  return row?.n ?? 0
}

/** Les classes de l'enseignant (ordre alphabétique) avec leur nombre de défis en attente. */
export async function pendingByClass(db: DB, teacherId: string): Promise<ClassPending[]> {
  const rows = await db.select({
    classId: classes.id, name: classes.name, level: classes.level,
    pending: countDistinct(progress.id),
  }).from(classes)
    .leftJoin(classStudents, eq(classStudents.classId, classes.id))
    .leftJoin(students, eq(students.email, classStudents.studentEmail))
    .leftJoin(progress, and(eq(progress.studentId, students.id), eq(progress.status, 'submitted')))
    .where(eq(classes.teacherId, teacherId))
    .groupBy(classes.id)
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
}

async function history(db: DB, progressId: string): Promise<ReviewEntry[]> {
  const rows = await db.select({
    decision: reviews.decision, comment: reviews.comment, createdAt: reviews.createdAt, automatic: reviews.automatic, verifiedBy: reviews.verifiedBy,
    firstName: teachers.firstName, lastName: teachers.lastName,
  }).from(reviews).innerJoin(teachers, eq(teachers.id, reviews.teacherId))
    .where(eq(reviews.progressId, progressId)).orderBy(desc(reviews.createdAt))
  const nameOf = async (id: string | null) => {
    if (!id) return null
    const [t] = await db.select({ firstName: teachers.firstName, lastName: teachers.lastName }).from(teachers).where(eq(teachers.id, id)).limit(1)
    return t ? `${t.firstName} ${t.lastName}` : null
  }
  return Promise.all(rows.map(async (r) => ({
    decision: r.decision, comment: r.comment, createdAt: r.createdAt, teacherName: `${r.firstName} ${r.lastName}`,
    automatic: r.automatic, verifiedByName: await nameOf(r.verifiedBy),
  })))
}

export async function getReviewView(db: DB, teacherId: string, progressId: string): Promise<ReviewView | null> {
  if (!UUID.test(progressId)) return null
  const [row] = await db.select().from(progress).where(eq(progress.id, progressId)).limit(1)
  if (!row || !(await teacherCanSeeStudent(db, teacherId, row.studentId))) return null
  const student = await studentInfo(db, row.studentId)
  const activity = await getActivityDetail(db, row.activityId)
  if (!student || !activity) return null
  return { progress: row, student, activity, history: await history(db, progressId) }
}

export async function decide(
  db: DB, teacherId: string, progressId: string, input: { decision: string; comment: string; extendTo?: string },
  options: { automatic?: boolean; verifiedBy?: string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const decision = input.decision as ReviewDecision
  if (!(REVIEW_DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: 'Choisissez une décision.' }
  const comment = input.comment.trim()
  if (decision !== 'validated' && !comment) return { ok: false, error: 'Un commentaire est obligatoire pour aider l’élève à continuer.' }
  if (comment.length > MAX_COMMENT) return { ok: false, error: `Le commentaire ne doit pas dépasser ${MAX_COMMENT} caractères.` }
  // Délai accordé avec la décision (échéance passée) : nouvelle date et heure limite pour cet élève.
  const extendRaw = input.extendTo?.trim() ?? ''
  const extendTo = extendRaw ? parseSchoolDateTime(extendRaw) : null
  if (extendRaw && !extendTo) return { ok: false, error: 'Date limite invalide : indiquez un jour et une heure.' }
  if (extendTo && decision === 'validated') return { ok: false, error: 'Un délai ne s’accorde qu’avec « presque réussi » ou « non réussi ».' }
  if (extendTo && Date.parse(extendTo) <= now().getTime()) return { ok: false, error: 'La nouvelle date limite doit être dans le futur.' }
  const view = await getReviewView(db, teacherId, progressId)
  if (!view) return { ok: false, error: 'Défi introuvable.' }
  // Vérifié avant d'enregistrer la décision : sinon le professeur croirait avoir accordé un délai qui n'existe pas.
  if (extendTo && !(await givesActivityTo(db, teacherId, view.student.id, view.progress.activityId)))
    return { ok: false, error: 'Ce défi n’est donné à cet élève par aucune de vos classes.' }

  const stamp = new Date().toISOString()
  const done = await db.transaction(async (tx) => {
    // Mise à jour conditionnelle : un seul gagnant si deux décisions arrivent ensemble, ou si l'élève a repris la main.
    const changed = await tx.update(progress)
      .set({ status: decision, updatedAt: stamp, validatedAt: decision === 'validated' ? stamp : null })
      .where(and(eq(progress.id, progressId), eq(progress.status, 'submitted'))).returning({ id: progress.id })
    if (changed.length !== 1) return false
    await tx.insert(reviews).values({ progressId, teacherId, decision, comment: comment || null, createdAt: stamp, automatic: options.automatic ?? false, verifiedBy: options.verifiedBy ?? null })
    return true
  })
  if (!done) return { ok: false, error: 'Ce défi n’est plus en attente de validation (il a peut-être déjà été traité).' }
  if (extendTo) await grantExtension(db, teacherId, view.student.id, view.progress.activityId, extendTo)
  return { ok: true }
}

export async function studentOverview(db: DB, teacherId: string, studentId: string): Promise<StudentOverview | null> {
  if (!UUID.test(studentId) || !(await teacherCanSeeStudent(db, teacherId, studentId))) return null
  const student = await studentInfo(db, studentId)
  if (!student) return null
  const items = await db.select({
    progressId: progress.id, activityId: activities.id, activityTitle: activities.title, status: progress.status, updatedAt: progress.updatedAt,
  }).from(progress).innerJoin(activities, eq(activities.id, progress.activityId))
    .where(eq(progress.studentId, studentId)).orderBy(desc(progress.updatedAt))
  return { student, items }
}

export async function resetStudentPassword(db: DB, teacherId: string, studentId: string): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  if (!UUID.test(studentId) || !(await teacherCanSeeStudent(db, teacherId, studentId))) return { ok: false, error: 'Élève introuvable.' }
  const password = generateProvisionalPassword()
  await setStudentPassword(db, studentId, await hashPassword(password), true)
  await db.update(students).set({ passwordResetBy: teacherId, passwordResetAt: new Date().toISOString() }).where(eq(students.id, studentId))
  return { ok: true, password }
}

/** Défis voisins dans la file (boutons « précédent / suivant ») ; hors file, « suivant » mène au plus ancien. */
export function queueNeighbors(queue: QueueItem[], progressId: string): { previous: string | null; next: string | null } {
  const index = queue.findIndex((q) => q.progressId === progressId)
  if (index === -1) return { previous: null, next: queue[0]?.progressId ?? null }
  return { previous: queue[index - 1]?.progressId ?? null, next: queue[index + 1]?.progressId ?? null }
}
