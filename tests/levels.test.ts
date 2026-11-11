import { expect, it } from 'vitest'
import { levelsLabel } from '@/lib/levels'

it('affiche les niveaux d’un élève, déduits de ses classes', () => {
  expect(levelsLabel([])).toBe('Sans classe')
  expect(levelsLabel(['6'])).toBe('6e')
  expect(levelsLabel(['5', '6', '6'])).toBe('6e · 5e')
})
