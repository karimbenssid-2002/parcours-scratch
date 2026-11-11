export type Theme = 'light' | 'dark'
export const THEME_COOKIE = 'theme'

/** Valeur du cookie de thème ; undefined = suivre le système. */
export function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined
}
