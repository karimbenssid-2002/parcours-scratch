import type { AdminClaims, StudentClaims } from './jwt'

const ADMIN_PUBLIC = ['/admin/login', '/admin/demande-compte']
export const ADMIN_ONLY_PATHS = ['/admin/demandes', '/admin/enseignants', '/admin/eleves', '/admin/activites', '/admin/parcours']

const STUDENT_PUBLIC = ['/connexion']

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + '/')

/** Redirections grossières faites par le proxy. Les pages et actions revérifient les droits côté serveur. */
export function decide(
  pathname: string,
  admin: AdminClaims | null,
  student: StudentClaims | null,
): { redirect: string } | null {
  if (pathname === '/admin/deconnexion' || pathname === '/deconnexion' || pathname.startsWith('/api/')) return null
  // Départ et retour de Google, connexion de développement : avant toute session (les routes vérifient tout elles-mêmes).
  if (under(pathname, '/auth')) return null
  // Règles de confidentialité : lisibles par tous, connecté ou non (Google les lit aussi).
  if (under(pathname, '/confidentialite')) return null

  if (under(pathname, '/admin')) {
    const isPublic = ADMIN_PUBLIC.some((p) => under(pathname, p))
    if (!admin) return isPublic ? null : { redirect: '/admin/login' }
    if (isPublic) return { redirect: '/admin' }
    if (admin.role !== 'admin' && ADMIN_ONLY_PATHS.some((p) => under(pathname, p))) return { redirect: '/admin' }
    return null
  }

  const isPublic = STUDENT_PUBLIC.some((p) => under(pathname, p))
  if (!student) return isPublic ? null : { redirect: '/connexion' }
  if (isPublic) return { redirect: '/' }
  return null
}
