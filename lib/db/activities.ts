import { and, asc, count, eq, inArray, isNull, max } from 'drizzle-orm'
import type { DB } from './client'
import { activities, activityHelpVideos, levelActivities } from './schema'
import type { Level } from '@/lib/levels'
import { slugify } from '@/lib/slug'
import { fold } from '@/lib/text'

export type Section = 'defis' | 'mini-projet'
export type ParcoursItem = { activityId: string; title: string; thumbnail: string | null; section: Section; number: number }

export async function listPublishedParcours(db: DB, level: Level): Promise<ParcoursItem[]> {
  const rows = await db
    .select({ activityId: activities.id, title: activities.title, thumbnail: activities.thumbnail, section: levelActivities.section })
    .from(levelActivities)
    .innerJoin(activities, eq(levelActivities.activityId, activities.id))
    .where(and(eq(levelActivities.level, level), eq(activities.status, 'published')))
    .orderBy(asc(levelActivities.position))
  return rows.map((r, i) => ({ ...r, number: i + 1 }))
}

/** Crée l'activité importée si elle n'existe pas ; ne modifie jamais une activité existante. */
export async function upsertBreizhActivity(
  db: DB,
  a: { sourceRef: number; title: string; slug: string; statementYoutubeId: string | null; thumbnail: string | null },
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db.select({ id: activities.id }).from(activities).where(eq(activities.sourceRef, a.sourceRef)).limit(1)
  if (existing) return { id: existing.id, created: false }
  const [row] = await db.insert(activities).values({ ...a, source: 'breizh', status: 'draft' }).returning({ id: activities.id })
  return { id: row.id, created: true }
}

export async function replaceHelpVideos(db: DB, activityId: string, videos: { title: string; youtubeId: string }[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(activityHelpVideos).where(eq(activityHelpVideos.activityId, activityId))
    if (videos.length > 0) await tx.insert(activityHelpVideos).values(videos.map((v, position) => ({ activityId, ...v, position })))
  })
}

export async function addToLevel(db: DB, e: { level: Level; activityId: string; position: number; section: Section }): Promise<void> {
  await db.insert(levelActivities).values(e).onConflictDoNothing()
}

export async function setActivityStatus(db: DB, activityId: string, status: 'draft' | 'published'): Promise<void> {
  await db.update(activities).set({ status, updatedAt: new Date().toISOString() }).where(eq(activities.id, activityId))
}

export type ActivityDetail = typeof activities.$inferSelect & {
  helpVideos: { title: string; youtubeId: string }[]
  levels: Level[]
}

export async function getActivityDetail(db: DB, id: string): Promise<ActivityDetail | null> {
  const [activity] = await db.select().from(activities).where(eq(activities.id, id)).limit(1)
  if (!activity) return null
  const helpVideos = await db.select({ title: activityHelpVideos.title, youtubeId: activityHelpVideos.youtubeId })
    .from(activityHelpVideos).where(eq(activityHelpVideos.activityId, id)).orderBy(asc(activityHelpVideos.position))
  const levels = (await db.select({ level: levelActivities.level }).from(levelActivities)
    .where(eq(levelActivities.activityId, id))).map((r) => r.level)
  return { ...activity, helpVideos, levels }
}

export async function setStarter(db: DB, activityId: string, path: string, source: 'upload' | 'capytale' | 'breizh'): Promise<void> {
  await db.update(activities).set({ starterProjectPath: path, starterSource: source, updatedAt: new Date().toISOString() })
    .where(eq(activities.id, activityId))
}

export async function getStarterPath(db: DB, activityId: string): Promise<string | null> {
  const [row] = await db.select({ p: activities.starterProjectPath }).from(activities).where(eq(activities.id, activityId)).limit(1)
  return row?.p ?? null
}

export type AdminActivityRow = {
  id: string; title: string; status: 'draft' | 'published'; levels: Level[]
  starterSource: 'upload' | 'capytale' | 'breizh' | null; helpCount: number; updatedAt: string
}
export type LevelEntry = { activityId: string; title: string; status: 'draft' | 'published'; position: number; section: Section }

export async function listActivitiesAdmin(db: DB, filter: { q?: string; status?: 'draft' | 'published' }): Promise<AdminActivityRow[]> {
  // Recherche faite ici (et non en SQL) : casse et accents repliés comme partout ailleurs (« Écran »).
  const q = fold(filter.q?.trim() ?? '')
  const rows = (await db.select().from(activities).where(filter.status ? eq(activities.status, filter.status) : undefined)
    .orderBy(asc(activities.title)))
    .filter((r) => !q || fold(r.title).includes(q))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const levels = await db.select({ activityId: levelActivities.activityId, level: levelActivities.level }).from(levelActivities)
    .where(inArray(levelActivities.activityId, ids))
  const help = await db.select({ activityId: activityHelpVideos.activityId, n: count() }).from(activityHelpVideos)
    .where(inArray(activityHelpVideos.activityId, ids)).groupBy(activityHelpVideos.activityId)
  return rows.map((r) => ({
    id: r.id, title: r.title, status: r.status, starterSource: r.starterSource, updatedAt: r.updatedAt,
    levels: levels.filter((l) => l.activityId === r.id).map((l) => l.level).sort().reverse(),
    helpCount: help.find((h) => h.activityId === r.id)?.n ?? 0,
  }))
}

async function uniqueSlug(db: DB, title: string): Promise<string> {
  const base = slugify(title) || 'activite'
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const taken = await db.select({ id: activities.id }).from(activities).where(eq(activities.slug, candidate)).limit(1)
    if (taken.length === 0) return candidate
  }
}

export async function createActivity(db: DB, input: { title: string }): Promise<{ id: string }> {
  const title = input.title.trim()
  // Deux créations simultanées du même titre peuvent choisir le même slug : la seconde recommence avec le suivant.
  for (;;) {
    const [row] = await db.insert(activities).values({ title, slug: await uniqueSlug(db, title), source: 'admin', status: 'draft' })
      .onConflictDoNothing({ target: activities.slug }).returning({ id: activities.id })
    if (row) return row
  }
}

/** Marque comme annoncées les activités publiées qui ne l'étaient pas encore ; renvoie celles qui viennent de l'être (une seule fois par activité, même à deux onglets). */
export async function claimAnnouncements(db: DB, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db.update(activities).set({ announcedAt: new Date().toISOString() })
    .where(and(inArray(activities.id, ids), eq(activities.status, 'published'), isNull(activities.announcedAt)))
    .returning({ id: activities.id })
  return rows.map((r) => r.id)
}

export async function updateActivity(
  db: DB, id: string, input: { title: string; instructions: string | null; statementYoutubeId: string | null; status: 'draft' | 'published' },
): Promise<void> {
  await db.update(activities).set({ ...input, title: input.title.trim(), updatedAt: new Date().toISOString() }).where(eq(activities.id, id))
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

async function compact(tx: Tx, level: Level) {
  const entries = await tx.select({ activityId: levelActivities.activityId }).from(levelActivities)
    .where(eq(levelActivities.level, level)).orderBy(asc(levelActivities.position))
  for (const [i, e] of entries.entries()) {
    await tx.update(levelActivities).set({ position: i + 1 })
      .where(and(eq(levelActivities.level, level), eq(levelActivities.activityId, e.activityId)))
  }
}

export async function setActivityLevels(db: DB, id: string, levels: Level[]): Promise<void> {
  await db.transaction(async (tx) => {
    const current = (await tx.select({ level: levelActivities.level }).from(levelActivities).where(eq(levelActivities.activityId, id))).map((r) => r.level)
    for (const level of current.filter((l) => !levels.includes(l))) {
      await tx.delete(levelActivities).where(and(eq(levelActivities.level, level), eq(levelActivities.activityId, id)))
      await compact(tx, level)
    }
    for (const level of levels.filter((l) => !current.includes(l))) {
      const [last] = await tx.select({ m: max(levelActivities.position) }).from(levelActivities).where(eq(levelActivities.level, level))
      await tx.insert(levelActivities).values({ level, activityId: id, position: (last?.m ?? 0) + 1, section: 'defis' })
    }
  })
}

export async function levelOrder(db: DB, level: Level): Promise<LevelEntry[]> {
  return db.select({ activityId: activities.id, title: activities.title, status: activities.status, position: levelActivities.position, section: levelActivities.section })
    .from(levelActivities).innerJoin(activities, eq(activities.id, levelActivities.activityId))
    .where(eq(levelActivities.level, level)).orderBy(asc(levelActivities.position))
}

/** Applique un nouvel ordre ; refuse s'il ne contient pas exactement les activités du niveau (requête forgée, autre onglet). */
export async function setLevelOrder(db: DB, level: Level, activityIds: string[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (await tx.select({ id: levelActivities.activityId }).from(levelActivities).where(eq(levelActivities.level, level))).map((r) => r.id)
    const same = activityIds.length === current.length && new Set(activityIds).size === activityIds.length && activityIds.every((id) => current.includes(id))
    if (!same) return false
    for (const [i, activityId] of activityIds.entries()) {
      await tx.update(levelActivities).set({ position: i + 1 })
        .where(and(eq(levelActivities.level, level), eq(levelActivities.activityId, activityId)))
    }
    return true
  })
}

export async function removeFromLevel(db: DB, level: Level, activityId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(levelActivities).where(and(eq(levelActivities.level, level), eq(levelActivities.activityId, activityId)))
    await compact(tx, level)
  })
}
