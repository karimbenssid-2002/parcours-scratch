export const LEVELS = ['6', '5', '4', '3'] as const
export type Level = (typeof LEVELS)[number]

export function levelLabel(level: Level): string {
  return `${level}e`
}

export function parseLevel(value: unknown): Level | null {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value) ? (value as Level) : null
}

/** Niveaux d'un élève, déduits de ses classes : « 6e · 5e », ou « Sans classe ». */
export function levelsLabel(levels: readonly Level[]): string {
  const unique = LEVELS.filter((l) => levels.includes(l))
  return unique.length ? unique.map(levelLabel).join(' · ') : 'Sans classe'
}
