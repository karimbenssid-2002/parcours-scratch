import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, verifyAdmin } from '@/lib/auth/jwt'
import { deviceCookie, dropDeviceSubscription } from '@/lib/push/device'

// Efface la session enseignant ; `?deconnexion=1` affiche sur la page de connexion le rappel pour ordinateur partagé.
// L'abonnement aux notifications de cet appareil est supprimé avant d'effacer la session.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value
  const claims = token ? await verifyAdmin(token) : null
  await dropDeviceSubscription(request.cookies.get(deviceCookie('admin'))?.value, claims && { kind: 'teacher', id: claims.teacherId })
  const response = NextResponse.redirect(new URL('/admin/login?deconnexion=1', request.url))
  response.cookies.delete(ADMIN_COOKIE)
  response.cookies.delete(deviceCookie('admin'))
  return response
}
