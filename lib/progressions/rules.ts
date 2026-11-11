// Règles pures des progressions : utilisables côté navigateur (pas d'accès à la base).
import type { Theme } from '@/lib/db/progressions'
import type { Level } from '@/lib/levels'

/** Ids des défis d'un thème, dans l'ordre d'affichage (étape puis position). */
export function themeActivityIds(theme: Theme): string[] {
  return theme.items.map((i) => i.activityId)
}

/**
 * Premier thème non facultatif qui précède `themeId` et dont aucun défi n'est donné à la classe.
 * `themes` : la progression `publishedOnly`. Jamais d'avertissement pour un thème facultatif.
 */
export function missingPrerequisite(themes: Theme[], assigned: ReadonlySet<string>, themeId: string): { number: number; title: string } | null {
  const core = themes.filter((t) => !t.optional)
  const index = core.findIndex((t) => t.id === themeId)
  if (index <= 0) return null
  const missing = core.slice(0, index).findIndex((t) => !t.items.some((i) => assigned.has(i.activityId)))
  return missing === -1 ? null : { number: missing + 1, title: core[missing].title }
}

/** Thèmes non facultatifs et défis distincts qu'ils contiennent. */
export function progressionCounts(themes: Theme[]): { themes: number; defis: number } {
  const core = themes.filter((t) => !t.optional)
  return { themes: core.length, defis: new Set(core.flatMap(themeActivityIds)).size }
}

type Prerequisite = { number: number; title: string }

/**
 * Avertissement d'un thème affiché : seulement dans la progression du niveau de la classe.
 * Piocher dans la progression d'un autre niveau (une classe précédente…) ne vérifie pas l'ordre des thèmes.
 */
export function themePrerequisite(
  progressions: Record<Level, Theme[]>, classLevel: Level, shownLevel: Level, assigned: ReadonlySet<string>, themeId: string,
): Prerequisite | null {
  return shownLevel === classLevel ? missingPrerequisite(progressions[classLevel], assigned, themeId) : null
}

/** Avertissement d'une sélection : thèmes de la progression de la classe touchés par la sélection (cochés = donnés). */
export function selectionPrerequisite(
  progressions: Record<Level, Theme[]>, classLevel: Level, assigned: ReadonlySet<string>, ids: string[],
): Prerequisite | null {
  const withSelection = new Set([...assigned, ...ids])
  for (const t of progressions[classLevel]) {
    if (!t.items.some((i) => ids.includes(i.activityId))) continue
    const missing = missingPrerequisite(progressions[classLevel], withSelection, t.id)
    if (missing) return missing
  }
  return null
}
