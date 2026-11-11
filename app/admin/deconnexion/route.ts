import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/auth/jwt'

// Efface la session enseignant ; `?deconnexion=1` affiche sur la page de connexion le rappel pour ordinateur partagé.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin/login?deconnexion=1', request.url))
  response.cookies.delete(ADMIN_COOKIE)
  return response
}
