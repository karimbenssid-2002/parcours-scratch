import { NextResponse, type NextRequest } from 'next/server'
import { STUDENT_COOKIE, verifyStudent } from '@/lib/auth/jwt'
import { deviceCookie, dropDeviceSubscription } from '@/lib/push/device'

// Efface la session élève. `?erreur=non-inscrit` (élève retiré de toutes les classes, voir requireStudent) : la page de
// connexion l'explique. Sinon, déconnexion voulue : `?deconnexion=1` y affiche le rappel pour ordinateur partagé.
// L'abonnement aux notifications de cet appareil est supprimé avant d'effacer la session.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(STUDENT_COOKIE)?.value
  const claims = token ? await verifyStudent(token) : null
  await dropDeviceSubscription(request.cookies.get(deviceCookie('eleve'))?.value, claims && { kind: 'student', id: claims.studentId })
  const removed = request.nextUrl.searchParams.get('erreur') === 'non-inscrit'
  const response = NextResponse.redirect(new URL(removed ? '/connexion?erreur=non-inscrit' : '/connexion?deconnexion=1', request.url))
  response.cookies.delete(STUDENT_COOKIE)
  response.cookies.delete(deviceCookie('eleve'))
  return response
}
