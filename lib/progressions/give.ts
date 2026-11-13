import type { DB } from '@/lib/db/client'
import { addAssignmentsDetailed } from '@/lib/db/assignments'
import { listProgression, type Theme } from '@/lib/db/progressions'
import { LEVELS, type Level } from '@/lib/levels'
import { themeActivityIds } from './rules'

export { missingPrerequisite, progressionCounts, themeActivityIds } from './rules'

async function publishedThemes(db: DB, levels: Level[]): Promise<Theme[]> {
  return (await Promise.all(levels.map((l) => listProgression(db, l, { publishedOnly: true })))).flat()
}

/** Donne les défis publiés des thèmes, thème après thème dans l'ordre donné ; renvoie le nombre ajouté. */
export async function giveThemes(db: DB, classId: string, themeIds: string[]): Promise<number> {
  return (await giveThemesDetailed(db, classId, themeIds)).length
}

/** Comme `giveThemes`, mais renvoie les identifiants des défis réellement ajoutés. */
export async function giveThemesDetailed(db: DB, classId: string, themeIds: string[]): Promise<string[]> {
  const all = await publishedThemes(db, [...LEVELS])
  const ids = themeIds.flatMap((id) => { const t = all.find((th) => th.id === id); return t ? themeActivityIds(t) : [] })
  return addAssignmentsDetailed(db, classId, ids)
}

/** Donne tout le parcours d'un niveau : ses thèmes non facultatifs, dans l'ordre. */
export async function giveProgression(db: DB, classId: string, level: Level): Promise<number> {
  return (await giveProgressionDetailed(db, classId, level)).length
}

/** Comme `giveProgression`, mais renvoie les identifiants des défis réellement ajoutés. */
export async function giveProgressionDetailed(db: DB, classId: string, level: Level): Promise<string[]> {
  const ids = (await listProgression(db, level, { publishedOnly: true })).filter((t) => !t.optional).flatMap(themeActivityIds)
  return addAssignmentsDetailed(db, classId, ids)
}
