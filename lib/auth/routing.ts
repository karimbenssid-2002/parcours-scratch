import type { AdminClaims, StudentClaims } from './jwt'

const ADMIN_PUBLIC = ['/admin/login', '/admin/demande-compte', '/admin/mot-de-passe-oublie']
const ADMIN_CHANGE_PW = '/admin/changer-mot-de-passe'
export const ADMIN_ONLY_PATHS = ['/admin/demandes', '/admin/enseignants', '/admin/eleves', '/admin/activites', '/admin/parcours']

const STUDENT_PUBLIC = ['/connexion', '/premiere-connexion']
const STUDENT_CHANGE_PW = '/nouveau-mot-de-passe'

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + '/')

/** Redirections grossières faites par le proxy. Les pages et actions revérifient les droits côté serveur. */
export function decide(
  pathname: string,
  admin: AdminClaims | null,
  student: StudentClaims | null,
): { redirect: string } | null {
  if (pathname === '/admin/deconnexion' || pathname === '/deconnexion' || pathname.startsWith('/api/')) return null

  if (under(pathname, '/admin')) {
    const isPublic = ADMIN_PUBLIC.some((p) => under(pathname, p))
    if (!admin) return isPublic ? null : { redirect: '/admin/login' }
    if (admin.mustChangePassword && pathname !== ADMIN_CHANGE_PW) return { redirect: ADMIN_CHANGE_PW }
    if (isPublic) return { redirect: '/admin' }
    if (admin.role !== 'admin' && ADMIN_ONLY_PATHS.some((p) => under(pathname, p))) return { redirect: '/admin' }
    return null
  }

  const isPublic = STUDENT_PUBLIC.some((p) => under(pathname, p))
  if (!student) return isPublic ? null : { redirect: '/connexion' }
  if (student.mustChangePassword && pathname !== STUDENT_CHANGE_PW) return { redirect: STUDENT_CHANGE_PW }
  if (isPublic) return { redirect: '/' }
  return null
}
