import { describe, expect, it } from 'vitest'
import { canEdit, canSubmit, STATUS_LABELS } from '@/lib/progress/rules'

describe('règles de statut', () => {
  it('modifiable tant que le professeur n’a pas le défi entre les mains', () => {
    expect(['not_started', 'in_progress', 'almost', 'needs_work'].every((s) => canEdit(s as never))).toBe(true)
    expect(canEdit('submitted')).toBe(false)
    expect(canEdit('validated')).toBe(false)
  })
  it('soumettable seulement après avoir commencé', () => {
    expect(canSubmit('not_started')).toBe(false)
    expect(canSubmit('in_progress')).toBe(true)
    expect(canSubmit('almost')).toBe(true)
    expect(canSubmit('needs_work')).toBe(true)
    expect(canSubmit('submitted')).toBe(false)
  })
  it('utilise les libellés de la spec', () => {
    expect(STATUS_LABELS.needs_work).toBe('Défi non réussi')
    expect(STATUS_LABELS.almost).toBe('Défi presque réussi')
    expect(STATUS_LABELS.validated).toBe('Défi validé')
  })
  it('« Non rendu » n’est ni modifiable ni envoyable', () => {
    expect(STATUS_LABELS.not_submitted).toBe('Non rendu')
    expect(canEdit('not_submitted')).toBe(false)
    expect(canSubmit('not_submitted')).toBe(false)
  })
})
