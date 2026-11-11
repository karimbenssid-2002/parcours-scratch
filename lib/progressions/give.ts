import type { DB } from '@/lib/db/client'
import { addAssignments } from '@/lib/db/assignments'
import { listProgression, type Theme } from '@/lib/db/progressions'
import { LEVELS, type Level } from '@/lib/levels'
import { themeActivityIds } from './rules'

export { missingPrerequisite, progressionCounts, themeActivityIds } from './rules'

async function publishedThemes(db: DB, levels: Level[]): Promise<Theme[]> {
  return (await Promise.all(levels.map((l) => listProgression(db, l, { publishedOnly: true })))).flat()
}

/** Donne les défis publiés des thèmes, thème après thème dans l'ordre donné ; renvoie le nombre ajouté. */
export async function giveThemes(db: DB, classId: string, themeIds: string[]): Promise<number> {
  const all = await publishedThemes(db, [...LEVELS])
  const ids = themeIds.flatMap((id) => { const t = all.find((th) => th.id === id); return t ? themeActivityIds(t) : [] })
  return addAssignments(db, classId, ids)
}

/** Donne tout le parcours d'un niveau : ses thèmes non facultatifs, dans l'ordre. */
export async function giveProgression(db: DB, classId: string, level: Level): Promise<number> {
  const ids = (await listProgression(db, level, { publishedOnly: true })).filter((t) => !t.optional).flatMap(themeActivityIds)
  return addAssignments(db, classId, ids)
}
