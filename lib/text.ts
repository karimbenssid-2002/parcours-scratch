/** Forme repliée pour la recherche : sans accents, en minuscules (« Élise » → « elise »). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
