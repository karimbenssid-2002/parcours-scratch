import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/auth/jwt'

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin/login', request.url))
  response.cookies.delete(ADMIN_COOKIE)
  return response
}
