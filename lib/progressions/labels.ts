import type { ThemeStep } from '@/lib/db/progressions'

export const STEP_LABELS: Record<ThemeStep, string> = { decouvrir: 'Découvrir', entrainer: 'S’entraîner', approfondir: 'Approfondir' }

/** ★☆☆ / ★★☆ / ★★★ */
export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)
