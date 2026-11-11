import type { KeyPress } from './types'

// Entrées de test utilisées quand l'activité n'en fournit pas (sans dépendance au navigateur : utilisable partout).
export const DEFAULT_ANSWERS = ['test', '5', 'oui']
export const DEFAULT_KEYS: KeyPress[] = [{ key: ' ', times: 2 }, { key: 'ArrowRight', times: 3 }, { key: 'ArrowUp', times: 2 }]
