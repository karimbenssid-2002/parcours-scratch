type GateTeacher = { isActive: boolean; role: 'admin' | 'prof' }

/** Chemin vers lequel rediriger, ou null si l'accès est autorisé. Utilisé par requireTeacher. */
export function teacherGate(
  teacher: GateTeacher | null,
  opts: { role?: 'admin' } = {},
): string | null {
  if (!teacher || !teacher.isActive) return '/admin/deconnexion'
  if (opts.role === 'admin' && teacher.role !== 'admin') return '/admin'
  return null
}

/** Aperçu « comme un élève » : l'administrateur voit tout, un enseignant seulement le stock publié. */
export function canPreviewActivity(role: 'admin' | 'prof', status: 'draft' | 'published'): boolean {
  return role === 'admin' || status === 'published'
}
