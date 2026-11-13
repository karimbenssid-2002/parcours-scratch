import { and, eq, isNull, ne, or } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities, classActivities, classes, classStudents, deadlineExtensions, lateNotices, progress, students } from '@/lib/db/schema'
import { effectiveDueAt } from '@/lib/db/assignments'
import { now } from '@/lib/clock'
import { schedule } from '@/lib/push/schedule'
import { notifyAutoSubmissions } from '@/lib/push/events'

export const GRACE_MS = 120_000
const OPEN = ['not_started', 'in_progress', 'almost', 'needs_work'] as const

type Pair = { studentId: string; activityId: string; dues: (string | null)[]; teacherIds: Set<string> }

/**
 * Rend les défis dont l'échéance effective est passée depuis plus de `graceMs`.
 * Idempotent : `closed_due_at` retient l'échéance traitée, et chaque mise à jour est conditionnelle.
 */
export async function closeOverdue(db: DB, at: Date = now(), options: { only?: { studentId: string; activityId: string }; graceMs?: number } = {}): Promise<number> {
  const cutoff = new Date(at.getTime() - (options.graceMs ?? GRACE_MS)).toISOString()
  const rows = await db.select({ studentId: students.id, activityId: classActivities.activityId, dueAt: classActivities.dueAt, teacherId: classes.teacherId })
    .from(classActivities)
    .innerJoin(classes, eq(classes.id, classActivities.classId))
    .innerJoin(classStudents, eq(classStudents.classId, classes.id))
    .innerJoin(students, eq(students.email, classStudents.studentEmail))
    .innerJoin(activities, and(eq(activities.id, classActivities.activityId), eq(activities.status, 'published')))
    .where(options.only ? and(eq(students.id, options.only.studentId), eq(classActivities.activityId, options.only.activityId)) : undefined)
  const pairs = new Map<string, Pair>()
  for (const r of rows) {
    const key = `${r.studentId}:${r.activityId}`
    const p = pairs.get(key) ?? { studentId: r.studentId, activityId: r.activityId, dues: [], teacherIds: new Set<string>() }
    p.dues.push(r.dueAt)
    p.teacherIds.add(r.teacherId)
    pairs.set(key, p)
  }
  const extensions = new Map((await db.select().from(deadlineExtensions)).map((e) => [`${e.studentId}:${e.activityId}`, e.dueAt]))
  // État actuel des paires, lu en une seule requête : appelée avant chaque page, la fonction ne doit ouvrir
  // une transaction que pour les paires qui changent vraiment (sinon une par paire échue, à chaque affichage).
  const closedDue = new Map((await db.select({ studentId: progress.studentId, activityId: progress.activityId, closedDueAt: progress.closedDueAt })
    .from(progress).where(options.only ? and(eq(progress.studentId, options.only.studentId), eq(progress.activityId, options.only.activityId)) : undefined))
    .map((p) => [`${p.studentId}:${p.activityId}`, p.closedDueAt]))

  let closed = 0
  const autoSubmitted: { studentId: string; activityId: string }[] = []
  const stamp = at.toISOString()
  for (const [key, pair] of pairs) {
    const due = effectiveDueAt(pair.dues, extensions.get(key) ?? null)
    if (!due || due > cutoff) continue
    if (closedDue.get(key) === due) continue // échéance déjà traitée pour cette paire
    const outcome = await db.transaction(async (tx) => {
      const where = and(eq(progress.studentId, pair.studentId), eq(progress.activityId, pair.activityId))
      await tx.insert(progress).values({ studentId: pair.studentId, activityId: pair.activityId }).onConflictDoNothing()
      const [row] = await tx.select().from(progress).where(where).limit(1)
      if (row.closedDueAt === due) return 0
      const notYetClosed = or(isNull(progress.closedDueAt), ne(progress.closedDueAt, due))
      if (!(OPEN as readonly string[]).includes(row.status)) {
        await tx.update(progress).set({ closedDueAt: due }).where(and(where, notYetClosed))
        return 0
      }
      const hasWork = row.projectPath !== null
      const changed = await tx.update(progress).set(hasWork
        ? { status: 'submitted', submittedAt: due, autoSubmittedAt: stamp, closedDueAt: due, updatedAt: stamp }
        : { status: 'not_submitted', closedDueAt: due, updatedAt: stamp })
        .where(and(where, eq(progress.status, row.status), notYetClosed)).returning({ id: progress.id })
      if (changed.length !== 1) return 0
      for (const teacherId of pair.teacherIds)
        await tx.insert(lateNotices).values({ teacherId, progressId: row.id, kind: hasWork ? 'auto_submitted' : 'not_submitted', dueAt: due })
          .onConflictDoNothing()
      return hasWork ? 2 : 1 // 2 : copie rendue automatiquement
    })
    if (outcome > 0) closed++
    if (outcome === 2) autoSubmitted.push({ studentId: pair.studentId, activityId: pair.activityId })
  }
  // Notification groupée par enseignant, après la réponse ; jamais bloquante.
  if (autoSubmitted.length) schedule(() => notifyAutoSubmissions(db, autoSubmitted))
  return closed
}
