import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db/client'
import { findStudentById } from '@/lib/db/students'
import { findTeacherById } from '@/lib/db/teachers'
import { devLoginEnabled } from '@/lib/auth/dev-login'
import { setSessionCookie } from '@/lib/auth/google-flow'
import { openStudentAccount, openTeacherAccount } from '@/lib/auth/google-login'
import { dropForeignDeviceSubscription } from '@/lib/push/device'
import { loginPath } from '@/lib/auth/login-errors'
import { adminSessionCookie, studentSessionCookie } from '@/lib/auth/session'

// Connexion de développement : ouvre la session d'un compte existant choisi dans la liste des pages de connexion.
// Introuvable (404) en production, sur Vercel, ou dès que la connexion Google est configurée.
export async function POST(request: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse(null, { status: 404 })
  // Formulaire envoyé depuis un autre site : refusé.
  const from = request.headers.get('origin')
  if ((from && from !== request.nextUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
    return new NextResponse(null, { status: 403 })
  const form = await request.formData().catch(() => null)
  const kind = form?.get('kind')
  const id = String(form?.get('id') ?? '')
  // 303 : le navigateur suit la redirection en GET après l'envoi du formulaire.
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin), 303)
  const db = getDb()

  if (kind === 'eleve') {
    const student = id ? await findStudentById(db, id) : null
    if (!student) return go(loginPath('eleve'))
    const res = go('/')
    setSessionCookie(res, await studentSessionCookie(await openStudentAccount(db, student)))
    await dropForeignDeviceSubscription(request, res, 'eleve', { kind: 'student', id: student.id })
    return res
  }
  if (kind === 'enseignant') {
    const teacher = id ? await findTeacherById(db, id) : null
    if (!teacher || !teacher.isActive) return go(loginPath('enseignant'))
    const res = go('/admin')
    setSessionCookie(res, await adminSessionCookie(await openTeacherAccount(db, teacher)))
    await dropForeignDeviceSubscription(request, res, 'admin', { kind: 'teacher', id: teacher.id })
    return res
  }
  return go(loginPath('eleve'))
}
