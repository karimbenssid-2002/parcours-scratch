import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, STUDENT_COOKIE, secretKey, verifyAdmin, verifyStudent } from '@/lib/auth/jwt'
import { APP_SEEN_MAX_AGE, appModeCookie, appSeenCookie, signSeen } from '@/lib/auth/app-idle'

// Appli installée encore à l'écran (ou qui se ferme) : renouvelle le dernier passage. Jamais mis en cache.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const app = new URL(request.url).searchParams.get('app')
  if (app !== 'admin' && app !== 'eleve') return new NextResponse(null, { status: 400 })
  const jar = await cookies()
  const token = jar.get(app === 'admin' ? ADMIN_COOKIE : STUDENT_COOKIE)?.value
  const valid = token && (app === 'admin' ? await verifyAdmin(token) : await verifyStudent(token))
  if (!token || !valid) return new NextResponse(null, { status: 401 })
  if (jar.get(appModeCookie(app))?.value !== '1') return new NextResponse(null, { status: 204 })
  const value = await signSeen(Date.now(), token, secretKey(app === 'admin' ? 'AUTH_SECRET' : 'STUDENT_AUTH_SECRET'))
  const res = new NextResponse(null, { status: 204 })
  res.cookies.set(appSeenCookie(app), value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: APP_SEEN_MAX_AGE,
  })
  return res
}
