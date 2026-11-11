import { fold } from '@/lib/text'
import type { KeyPress } from './runner/types'

// Noms saisis par l'admin (français ou anglais) → touche Scratch.
const NAMES: Record<string, string> = {
  espace: 'space', space: 'space',
  'fleche droite': 'ArrowRight', droite: 'ArrowRight', right: 'ArrowRight',
  'fleche gauche': 'ArrowLeft', gauche: 'ArrowLeft', left: 'ArrowLeft',
  'fleche haut': 'ArrowUp', haut: 'ArrowUp', up: 'ArrowUp',
  'fleche bas': 'ArrowDown', bas: 'ArrowDown', down: 'ArrowDown',
  entree: 'Enter', enter: 'Enter',
}
const LABELS: Record<string, string> = { space: 'espace', ArrowRight: 'flèche droite', ArrowLeft: 'flèche gauche', ArrowUp: 'flèche haut', ArrowDown: 'flèche bas', Enter: 'entrée' }

/** « espace × 2, flèche droite x3 » → [{ key: 'space', times: 2 }, { key: 'ArrowRight', times: 3 }]. */
export function parseKeys(text: string): { ok: true; keys: KeyPress[] } | { ok: false; error: string } {
  const keys: KeyPress[] = []
  for (const raw of text.split(/[,\n;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*(?:[×x*]\s*(\d+))?$/i.exec(raw)
    const name = fold(m?.[1] ?? raw).replace(/\s+/g, ' ').trim()
    const key = NAMES[name] ?? (/^[a-z0-9]$/.test(name) ? name : null)
    const times = m?.[2] ? Number(m[2]) : 1
    if (!key) return { ok: false, error: `Touche inconnue : « ${raw} ». Utilisez une lettre, un chiffre, espace, entrée ou une flèche.` }
    if (times < 1 || times > 20) return { ok: false, error: `Répétition invalide pour « ${raw} » (entre 1 et 20).` }
    keys.push({ key, times })
  }
  return { ok: true, keys }
}

export function formatKeys(keys: KeyPress[]): string {
  return keys.map((k) => `${LABELS[k.key] ?? k.key}${k.times > 1 ? ` × ${k.times}` : ''}`).join(', ')
}
