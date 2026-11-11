import { NextResponse, type NextRequest } from 'next/server'
import { STUDENT_COOKIE } from '@/lib/auth/jwt'

// Efface la session élève. `?erreur=non-inscrit` (élève retiré de toutes les classes, voir requireStudent) : la page de
// connexion l'explique. Sinon, déconnexion voulue : `?deconnexion=1` y affiche le rappel pour ordinateur partagé.
export function GET(request: NextRequest) {
  const removed = request.nextUrl.searchParams.get('erreur') === 'non-inscrit'
  const response = NextResponse.redirect(new URL(removed ? '/connexion?erreur=non-inscrit' : '/connexion?deconnexion=1', request.url))
  response.cookies.delete(STUDENT_COOKIE)
  return response
}
