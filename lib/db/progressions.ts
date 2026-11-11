import { and, asc, eq, inArray, max } from 'drizzle-orm'
import type { DB } from './client'
import { activities, levelActivities, THEME_STEPS, themeActivities, themes } from './schema'
import { LEVELS, type Level } from '@/lib/levels'

export type ThemeStep = (typeof THEME_STEPS)[number]
export type Difficulty = 1 | 2 | 3
export type ThemeItemInput = { step: ThemeStep; difficulty: Difficulty; why: string }
export type ThemeItem = { activityId: string; title: string; status: 'draft' | 'published'; levels: Level[] } & ThemeItemInput
export type Theme = { id: string; level: Level; title: string; programme: string; intro: string; optional: boolean; items: ThemeItem[] }

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

const clampDifficulty = (n: number): Difficulty => (n <= 1 ? 1 : n >= 3 ? 3 : 2)

/** Progression d'un niveau : thèmes du parcours puis facultatifs ; défis groupés par étape, dans leur ordre. */
export async function listProgression(db: DB, level: Level, opts: { publishedOnly?: boolean } = {}): Promise<Theme[]> {
  const rows = await db.select().from(themes).where(eq(themes.level, level)).orderBy(asc(themes.position))
  if (rows.length === 0) return []
  const items = await db.select({
    themeId: themeActivities.themeId, activityId: activities.id, title: activities.title, status: activities.status,
    position: themeActivities.position, step: themeActivities.step, difficulty: themeActivities.difficulty, why: themeActivities.why,
  }).from(themeActivities).innerJoin(activities, eq(activities.id, themeActivities.activityId))
    .where(inArray(themeActivities.themeId, rows.map((r) => r.id)))
  const ids = [...new Set(items.map((i) => i.activityId))]
  const levelRows = ids.length ? await db.select({ id: levelActivities.activityId, level: levelActivities.level }).from(levelActivities)
    .where(inArray(levelActivities.activityId, ids)) : []
  const levelsOf = (id: string) => LEVELS.filter((l) => levelRows.some((r) => r.id === id && r.level === l))
  const stepRank = (s: ThemeStep) => THEME_STEPS.indexOf(s)

  const result = rows.map((t): Theme => ({
    id: t.id, level: t.level, title: t.title, programme: t.programme, intro: t.intro, optional: t.optional,
    items: items.filter((i) => i.themeId === t.id && (!opts.publishedOnly || i.status === 'published'))
      .sort((a, b) => stepRank(a.step) - stepRank(b.step) || a.position - b.position)
      .map((i) => ({
        activityId: i.activityId, title: i.title, status: i.status, levels: levelsOf(i.activityId),
        step: i.step, difficulty: clampDifficulty(i.difficulty), why: i.why,
      })),
  }))
  const ordered = [...result.filter((t) => !t.optional), ...result.filter((t) => t.optional)]
  return opts.publishedOnly ? ordered.filter((t) => t.items.length > 0) : ordered
}

export async function createTheme(db: DB, input: { level: Level; title: string; optional?: boolean }): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [last] = await tx.select({ m: max(themes.position) }).from(themes).where(eq(themes.level, input.level))
    const [row] = await tx.insert(themes)
      .values({ level: input.level, title: input.title.trim(), optional: input.optional ?? false, position: (last?.m ?? 0) + 1 })
      .returning({ id: themes.id })
    return row
  })
}

export async function updateTheme(db: DB, id: string, patch: { title: string; programme: string; intro: string; optional: boolean }): Promise<void> {
  await db.update(themes).set({ ...patch, title: patch.title.trim(), programme: patch.programme.trim(), intro: patch.intro.trim() })
    .where(eq(themes.id, id))
}

async function compactThemes(tx: Tx, level: Level) {
  const rows = await tx.select({ id: themes.id }).from(themes).where(eq(themes.level, level)).orderBy(asc(themes.position))
  for (const [i, r] of rows.entries()) await tx.update(themes).set({ position: i + 1 }).where(eq(themes.id, r.id))
}

/** Supprime le thème et sa liste de défis ; les défis déjà donnés aux classes ne sont pas touchés. */
export async function deleteTheme(db: DB, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ level: themes.level }).from(themes).where(eq(themes.id, id)).limit(1)
    if (!row) return
    await tx.delete(themes).where(eq(themes.id, id))
    await compactThemes(tx, row.level)
  })
}

const sameSet = (ids: string[], current: string[]) =>
  ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id))

/** Refuse un ordre qui ne contient pas exactement les thèmes du niveau (onglet périmé, requête forgée). */
export async function setThemeOrder(db: DB, level: Level, themeIds: string[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (await tx.select({ id: themes.id }).from(themes).where(eq(themes.level, level))).map((r) => r.id)
    if (!sameSet(themeIds, current)) return false
    for (const [i, id] of themeIds.entries()) await tx.update(themes).set({ position: i + 1 }).where(eq(themes.id, id))
    return true
  })
}

/** Ajoute le défi à la fin du thème ; `false` s'il y figure déjà, ou si le thème ou le défi n'existe plus (autre onglet). */
export async function addToTheme(db: DB, themeId: string, activityId: string, item: ThemeItemInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    if ((await tx.select({ id: themes.id }).from(themes).where(eq(themes.id, themeId)).limit(1)).length === 0) return false
    if ((await tx.select({ id: activities.id }).from(activities).where(eq(activities.id, activityId)).limit(1)).length === 0) return false
    const [last] = await tx.select({ m: max(themeActivities.position) }).from(themeActivities).where(eq(themeActivities.themeId, themeId))
    const inserted = await tx.insert(themeActivities)
      .values({ themeId, activityId, position: (last?.m ?? 0) + 1, ...item, difficulty: clampDifficulty(item.difficulty) })
      .onConflictDoNothing().returning({ activityId: themeActivities.activityId })
    return inserted.length === 1
  })
}

export async function updateThemeItem(db: DB, themeId: string, activityId: string, item: ThemeItemInput): Promise<void> {
  await db.update(themeActivities).set({ ...item, difficulty: clampDifficulty(item.difficulty), why: item.why.trim() })
    .where(and(eq(themeActivities.themeId, themeId), eq(themeActivities.activityId, activityId)))
}

export async function removeFromTheme(db: DB, themeId: string, activityId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(themeActivities).where(and(eq(themeActivities.themeId, themeId), eq(themeActivities.activityId, activityId)))
    const rows = await tx.select({ id: themeActivities.activityId }).from(themeActivities).where(eq(themeActivities.themeId, themeId))
      .orderBy(asc(themeActivities.position))
    for (const [i, r] of rows.entries()) {
      await tx.update(themeActivities).set({ position: i + 1 })
        .where(and(eq(themeActivities.themeId, themeId), eq(themeActivities.activityId, r.id)))
    }
  })
}

/** Même règle que `setThemeOrder`, pour les défis d'un thème. */
export async function setThemeItemOrder(db: DB, themeId: string, activityIds: string[]): Promise<boolean> {
  return db.transaction(async (tx) => {
    const current = (await tx.select({ id: themeActivities.activityId }).from(themeActivities).where(eq(themeActivities.themeId, themeId))).map((r) => r.id)
    if (!sameSet(activityIds, current)) return false
    for (const [i, activityId] of activityIds.entries()) {
      await tx.update(themeActivities).set({ position: i + 1 })
        .where(and(eq(themeActivities.themeId, themeId), eq(themeActivities.activityId, activityId)))
    }
    return true
  })
}
