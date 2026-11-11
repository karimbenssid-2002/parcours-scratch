import { NextResponse, type NextRequest } from 'next/server'
import { STUDENT_COOKIE } from '@/lib/auth/jwt'

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/connexion', request.url))
  response.cookies.delete(STUDENT_COOKIE)
  return response
}
