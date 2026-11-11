import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, STUDENT_COOKIE, verifyAdmin, verifyStudent } from '@/lib/auth/jwt'
import { decide } from '@/lib/auth/routing'

export async function proxy(request: NextRequest) {
  const adminToken = request.cookies.get(ADMIN_COOKIE)?.value
  const studentToken = request.cookies.get(STUDENT_COOKIE)?.value
  const admin = adminToken ? await verifyAdmin(adminToken) : null
  const student = studentToken ? await verifyStudent(studentToken) : null

  const decision = decide(request.nextUrl.pathname, admin, student)
  const response = decision ? NextResponse.redirect(new URL(decision.redirect, request.url)) : NextResponse.next()
  if (adminToken && !admin) response.cookies.delete(ADMIN_COOKIE)
  if (studentToken && !student) response.cookies.delete(STUDENT_COOKIE)
  return response
}

// /api/ est exclu : les routes API vérifient elles-mêmes la session, et un proxy tronquerait
// silencieusement les corps de requête au-delà de 10 Mo (sauvegarde des gros projets Scratch).
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
