import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, STUDENT_COOKIE, secretKey, verifyAdmin, verifyStudent } from '@/lib/auth/jwt'
import { decide } from '@/lib/auth/routing'
import { APP_SEEN_MAX_AGE, appIdleExpired, appModeCookie, appSeenCookie, areaOf, readSeen, signSeen } from '@/lib/auth/app-idle'

// Pas de contrôle d'absence : déconnexion, aller-retour Google (la session y est créée), règles de confidentialité.
const noIdleCheck = (p: string) => p === '/admin/deconnexion' || p === '/deconnexion' || p.startsWith('/auth/') || p.startsWith('/confidentialite')

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const adminToken = request.cookies.get(ADMIN_COOKIE)?.value
  const studentToken = request.cookies.get(STUDENT_COOKIE)?.value
  let admin = adminToken ? await verifyAdmin(adminToken) : null
  let student = studentToken ? await verifyStudent(studentToken) : null

  // Appli installée : session fermée si l'appli est restée fermée plus de 5 minutes (voir lib/auth/app-idle.ts).
  const area = areaOf(pathname)
  const token = area === 'admin' ? adminToken : studentToken
  const signedIn = area === 'admin' ? admin !== null : student !== null
  const appMode = request.cookies.get(appModeCookie(area))?.value === '1'
  let idleExpired = false
  let seen: string | null = null
  if (signedIn && token && appMode && !noIdleCheck(pathname)) {
    const secret = secretKey(area === 'admin' ? 'AUTH_SECRET' : 'STUDENT_AUTH_SECRET')
    const now = Date.now()
    const last = await readSeen(request.cookies.get(appSeenCookie(area))?.value, token, secret)
    if (appIdleExpired({ appMode, seenMs: last, nowMs: now })) {
      idleExpired = true
      if (area === 'admin') admin = null
      else student = null
    } else {
      seen = await signSeen(now, token, secret)
    }
  }

  const decision = decide(pathname, admin, student)
  const target = decision && idleExpired ? `${decision.redirect}?inactivite=1` : decision?.redirect
  const response = target ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next()
  if (adminToken && !admin) response.cookies.delete(ADMIN_COOKIE)
  if (studentToken && !student) response.cookies.delete(STUDENT_COOKIE)
  if (idleExpired) response.cookies.delete(appSeenCookie(area))
  if (seen) {
    response.cookies.set(appSeenCookie(area), seen, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: APP_SEEN_MAX_AGE,
    })
  }
  return response
}

// /api/ est exclu : les routes API vérifient elles-mêmes la session, et un proxy tronquerait
// silencieusement les corps de requête au-delà de 10 Mo (sauvegarde des gros projets Scratch).
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
