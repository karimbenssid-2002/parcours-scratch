import type { ProgressStatus } from '@/lib/db/schema'

/** Couleurs officielles des catégories de blocs Scratch (fond, ombre de bloc) et textes lisibles dessus. */
export const SC = {
  motion: '#4c97ff', motionSh: '#3373cc',
  looks: '#9966ff', looksSh: '#774dcb',
  brand: '#855cd6', brandSh: '#5b3cad',
  events: '#ffbf00', eventsSh: '#cc9900',
  control: '#ffab19', controlSh: '#cf8b17',
  pen: '#0fbd8c', penSh: '#0b8e69',
  go: '#59c059', goSh: '#389438',
  pink: '#ff6680', pinkSh: '#d94a63',
  onLight: '#1e1b4b', onYellow: '#3d2a00',
} as const

/** Tous les couples fond / texte utilisés dans l'interface (vérifiés par tests/ui-colors.test.ts). */
export const TEXT_PAIRS: [string, string][] = [
  [SC.motion, SC.onLight], [SC.pen, SC.onLight], [SC.go, SC.onLight], [SC.pink, SC.onLight],
  [SC.brand, '#ffffff'], [SC.events, SC.onYellow], [SC.control, SC.onYellow], ['#15803d', '#ffffff'],
  // Refonte « Deux encres » : encres, pastilles de statut (fond teinté / texte) et pastilles de niveau.
  ['#1e3f9e', '#ffffff'], ['#c8261f', '#ffffff'], ['#ffffff', '#c8261f'], ['#eef1f7', '#4f5874'],
  ['#e0f3e8', '#0f7044'], ['#ece8fb', '#5b3fc4'], ['#fdf0d9', '#9c5800'], ['#ffe9d6', '#a34a00'],
  ['#fde5e6', '#c42f3a'], ['#e4edfc', '#1e5fd0'], ['#eef1f6', '#5d6680'],
  ['#12804f', '#ffffff'], ['#1e5fd0', '#ffffff'], ['#c42f3a', '#ffffff'], ['#d9a400', '#352800'], ['#5b3fc4', '#ffffff'],
]

// Classes écrites en entier pour que Tailwind les détecte.
const CYCLE = [
  'bg-sc-motion text-sc-on-light [--sh:var(--color-sc-motion-sh)]',
  'bg-sc-pen text-sc-on-light [--sh:var(--color-sc-pen-sh)]',
  'bg-sc-brand text-white [--sh:var(--color-sc-brand-sh)]',
  'bg-sc-control text-sc-on-yellow [--sh:var(--color-sc-control-sh)]',
  'bg-sc-events text-sc-on-yellow [--sh:var(--color-sc-events-sh)]',
  'bg-sc-go text-sc-on-light [--sh:var(--color-sc-go-sh)]',
]

/** Couleur Scratch attribuée à un numéro de défi ou à un rang de vidéo (les défis n'ont pas de catégorie en base). */
export function scratchColor(n: number): { cls: string } {
  const i = (((n - 1) % CYCLE.length) + CYCLE.length) % CYCLE.length
  return { cls: CYCLE[i] }
}

/** Pastille de chaque statut : fond teinté et texte de la même famille (badges, retours). */
export const statusTone: Record<ProgressStatus, string> = {
  not_started: 'bg-st-idle-bg text-st-idle',
  in_progress: 'bg-st-run-bg text-st-run',
  submitted: 'bg-st-sent-bg text-st-sent',
  validated: 'bg-st-ok-bg text-st-ok',
  almost: 'bg-st-almost-bg text-st-almost',
  needs_work: 'bg-st-work-bg text-st-work',
  not_submitted: 'bg-st-bad-bg text-st-bad',
}

/** Couleur pleine de chaque statut (segments de la barre de progression). */
export const statusFill: Record<ProgressStatus, string> = {
  not_started: 'bg-line',
  in_progress: 'bg-st-run',
  submitted: 'bg-st-sent',
  validated: 'bg-st-ok',
  almost: 'bg-[#e59a12]',
  needs_work: 'bg-st-work',
  not_submitted: 'bg-st-bad',
}

/** Couleur d'un niveau (6e vert, 5e bleu, 4e rouge, 3e jaune). */
export function levelTone(level: string): string {
  if (level.startsWith('6')) return 'bg-lv6 text-white'
  if (level.startsWith('5')) return 'bg-lv5 text-white'
  if (level.startsWith('4')) return 'bg-lv4 text-white'
  if (level.startsWith('3')) return 'bg-lv3 text-[#352800]'
  return 'bg-st-idle-bg text-st-idle'
}
