import { describe, expect, it } from 'vitest'
import { canPreviewActivity, teacherGate } from '@/lib/auth/access'

const teacher = { isActive: true, mustChangePassword: false, role: 'prof' as const }

describe('teacherGate', () => {
  it('coupe immédiatement un enseignant désactivé, même avec un cookie valide', () => {
    expect(teacherGate({ ...teacher, isActive: false })).toBe('/admin/deconnexion')
    expect(teacherGate(null)).toBe('/admin/deconnexion')
  })
  it('force le changement de mot de passe sauf sur la page dédiée', () => {
    expect(teacherGate({ ...teacher, mustChangePassword: true })).toBe('/admin/changer-mot-de-passe')
    expect(teacherGate({ ...teacher, mustChangePassword: true }, { allowMustChange: true })).toBeNull()
  })
  it("réserve les pages admin à l'administrateur", () => {
    expect(teacherGate(teacher, { role: 'admin' })).toBe('/admin')
    expect(teacherGate({ ...teacher, role: 'admin' }, { role: 'admin' })).toBeNull()
  })
})

describe('canPreviewActivity', () => {
  it('ouvre le stock publié à tous les enseignants, les brouillons au seul administrateur', () => {
    expect(canPreviewActivity('prof', 'published')).toBe(true)
    expect(canPreviewActivity('prof', 'draft')).toBe(false)
    expect(canPreviewActivity('admin', 'draft')).toBe(true)
  })
})
