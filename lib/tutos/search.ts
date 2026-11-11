import { fold } from '@/lib/text'
import { TUTO_CATEGORIES, type Tuto, type TutoCategory } from './catalogue'

export type TutoGroup = { category: TutoCategory; tutos: Tuto[] }

/** Tutos regroupés par catégorie (ordre du catalogue) ; la recherche exige chaque mot, sans accents ni casse. */
export function groupTutos(tutos: readonly Tuto[], query: string): TutoGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const match = (t: Tuto) => { const hay = fold(`${t.title} ${t.summary} ${t.category}`); return words.every((w) => hay.includes(w)) }
  return TUTO_CATEGORIES.map((category) => ({ category, tutos: tutos.filter((t) => t.category === category && match(t)) }))
    .filter((g) => g.tutos.length > 0)
}
