import { and, asc, eq, inArray, max } from 'drizzle-orm'
import type { DB } from './client'
import { activities, activityAutograde, classActivities, classStudents, classes, deadlineExtensions, levelActivities, students } from './schema'
import type { ParcoursItem } from './activities'
import type { Level } from '@/lib/levels'

export type Assignment = { activityId: string; title: string; status: 'draft' | 'published'; position: number; dueAt: string | null; solutionShared: boolean; hasSolution: boolean }
export type StudentDefi = ParcoursItem & { dueAt: string | null; solutionShared: boolean }
export type StockItem = { id: string; title: string; levels: Level[] }

export async function listClassAssignments(db: DB, classId: string): Promise<Assignment[]> {
  return (await db.select({
    activityId: activities.id, title: activities.title, status: activities.status, position: classActivities.position,
    dueAt: classActivities.dueAt, solutionShared: classActivities.solutionShared, solutionPath: activityAutograde.solutionPath,
  }).from(classActivities).innerJoin(activities, eq(activities.id, classActivities.activityId))
    .leftJoin(activityAutograde, eq(activityAutograde.activityId, activities.id))
    .where(eq(classActivities.classId, classId)).orderBy(asc(classActivities.position)))
    .map(({ solutionPath, ...a }) => ({ ...a, hasSolution: solutionPath !== null }))
}

/** Ajoute à la suite les activités publiées pas encore données ; renvoie le nombre ajouté. */
export async function addAssignments(db: DB, classId: string, activityIds: string[]): Promise<number> {
  return (await addAssignmentsDetailed(db, classId, activityIds)).length
}

/** Comme `addAssignments`, mais renvoie les identifiants des seules activités réellement ajoutées (dans l'ordre d'ajout). */
export async function addAssignmentsDetailed(db: DB, classId: string, activityIds: string[]): Promise<string[]> {
  return db.transaction(async (tx) => {
    const unique = [...new Set(activityIds)]
    if (unique.length === 0) return []
    const published = new Set((await tx.select({ id: activities.id }).from(activities)
      .where(and(inArray(activities.id, unique), eq(activities.status, 'published')))).map((r) => r.id))
    const [last] = await tx.select({ m: max(classActivities.position) }).from(classActivities).where(eq(classActivities.classId, classId))
    let position = last?.m ?? 0
    const added: string[] = []
    for (const activityId of unique.filter((id) => published.has(id))) {
      const inserted = (await tx.insert(classActivities).values({ classId, activityId, position: position + 1 }).onConflictDoNothing()
        .returning({ activityId: classActivities.activityId })).length === 1
      if (inserted) { position++; added.push(activityId) }
    }
    return added
  })
}

export async function addLevelParcours(db: DB, classId: string, level: Level): Promise<number> {
  const ids = (await db.select({ id: levelActivities.activityId }).from(levelActivities)
    .where(eq(levelActivities.level, level)).orderBy(asc(levelActivities.position))).map((r) => r.id)
  return addAssignments(db, classId, ids)
}

async function compact(tx: Pick<DB, 'select' | 'update'>, classId: string) {
  const rows = await tx.select({ id: classActivities.activityId }).from(classActivities).where(eq(classActivities.classId, classId))
    .orderBy(asc(classActivities.position))
  for (const [i, r] of rows.entries()) {
    await tx.update(classActivities).set({ position: i + 1 })
      .where(and(eq(classActivities.classId, classId), eq(classActivities.activityId, r.id)))
  }
}

/** Retire le défi de la classe ; le travail des élèves reste en base. */
export async function removeAssignment(db: DB, classId: string, activityId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(classActivities).where(and(eq(classActivities.classId, classId), eq(classActivities.activityId, activityId)))
    await compact(tx, classId)
  })
}

/** Refuse un ordre qui ne contient pas exactement les défis de la classe (requête forgée, autre onglet). */
export async function setAssignmentOrder(db: DB, classId: string, activityIds: string[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (await tx.select({ id: classActivities.activityId }).from(classActivities).where(eq(classActivities.classId, classId))).map((r) => r.id)
    const same = activityIds.length === current.length && new Set(activityIds).size === activityIds.length && activityIds.every((id) => current.includes(id))
    if (!same) return false
    for (const [i, activityId] of activityIds.entries()) {
      await tx.update(classActivities).set({ position: i + 1 })
        .where(and(eq(classActivities.classId, classId), eq(classActivities.activityId, activityId)))
    }
    return true
  })
}

export async function setAssignmentDue(db: DB, classId: string, activityId: string, dueAt: string | null): Promise<boolean> {
  return (await db.update(classActivities).set({ dueAt })
    .where(and(eq(classActivities.classId, classId), eq(classActivities.activityId, activityId)))
    .returning({ activityId: classActivities.activityId })).length === 1
}

/**
 * La plus tardive des échéances de classe (aucune si une classe n'en fixe pas), repoussée par un délai accordé.
 * Un délai ne raccourcit jamais l'échéance : si la classe est repoussée au-delà, la date de la classe l'emporte.
 */
export function effectiveDueAt(classDueDates: (string | null)[], extension: string | null): string | null {
  if (classDueDates.length === 0 || classDueDates.some((d) => d === null)) return null
  const classDue = (classDueDates as string[]).reduce((a, b) => (a > b ? a : b))
  return extension && extension > classDue ? extension : classDue
}

export async function listStudentDefis(db: DB, studentId: string): Promise<StudentDefi[]> {
  const rows = await db.select({
    activityId: activities.id, title: activities.title, thumbnail: activities.thumbnail,
    position: classActivities.position, dueAt: classActivities.dueAt,
    shared: classActivities.solutionShared, solutionPath: activityAutograde.solutionPath,
  }).from(students)
    .innerJoin(classStudents, eq(classStudents.studentEmail, students.email))
    .innerJoin(classes, eq(classes.id, classStudents.classId))
    .innerJoin(classActivities, eq(classActivities.classId, classes.id))
    .innerJoin(activities, and(eq(activities.id, classActivities.activityId), eq(activities.status, 'published')))
    .leftJoin(activityAutograde, eq(activityAutograde.activityId, activities.id))
    .where(eq(students.id, studentId))
  const extensions = new Map((await db.select().from(deadlineExtensions).where(eq(deadlineExtensions.studentId, studentId)))
    .map((e) => [e.activityId, e.dueAt]))
  const grouped = new Map<string, { title: string; thumbnail: string | null; position: number; dues: (string | null)[]; shared: boolean }>()
  for (const r of rows) {
    const g = grouped.get(r.activityId)
    const shared = r.shared && r.solutionPath !== null // corrigé partagé par au moins une de ses classes
    if (g) { g.position = Math.min(g.position, r.position); g.dues.push(r.dueAt); g.shared ||= shared }
    else grouped.set(r.activityId, { title: r.title, thumbnail: r.thumbnail, position: r.position, dues: [r.dueAt], shared })
  }
  return [...grouped.entries()]
    .sort(([, x], [, y]) => x.position - y.position || x.title.localeCompare(y.title, 'fr'))
    .map(([activityId, g], i) => ({
      activityId, title: g.title, thumbnail: g.thumbnail, section: 'defis' as const, number: i + 1,
      dueAt: effectiveDueAt(g.dues, extensions.get(activityId) ?? null), solutionShared: g.shared,
    }))
}

export async function studentDeadline(db: DB, studentId: string, activityId: string): Promise<{ visible: boolean; dueAt: string | null; number: number | null }> {
  const defi = (await listStudentDefis(db, studentId)).find((d) => d.activityId === activityId)
  return defi ? { visible: true, dueAt: defi.dueAt, number: defi.number } : { visible: false, dueAt: null, number: null }
}

export async function listPublishedStock(db: DB): Promise<StockItem[]> {
  const rows = await db.select({ id: activities.id, title: activities.title }).from(activities).where(eq(activities.status, 'published'))
  const levels = await db.select({ id: levelActivities.activityId, level: levelActivities.level }).from(levelActivities)
  return rows.map((r) => ({ ...r, levels: levels.filter((l) => l.id === r.id).map((l) => l.level).sort() }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
}
