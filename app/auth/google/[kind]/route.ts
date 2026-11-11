import { NextResponse, type NextRequest } from 'next/server'
import { GoogleLoginError, sealPending, startGoogleLogin } from '@/lib/auth/google'
import { callbackUrl, logGoogleFailure, serverErrorDetail, setPendingCookie } from '@/lib/auth/google-flow'
import type { LoginKind } from '@/lib/auth/identity'
import { loginPath } from '@/lib/auth/login-errors'

// Départ vers Google : /auth/google/eleve ou /auth/google/enseignant.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== 'eleve' && kind !== 'enseignant') return new NextResponse(null, { status: 404 })
  const k: LoginKind = kind

  let started: Awaited<ReturnType<typeof startGoogleLogin>>
  try {
    started = await startGoogleLogin(k, callbackUrl(request))
  } catch (e) {
    // Identifiant Google absent (non configuré) : retour à la page de connexion.
    logGoogleFailure(`départ impossible : ${e instanceof GoogleLoginError ? e.detail : serverErrorDetail(e)}`)
    return NextResponse.redirect(new URL(loginPath(k, 'echec'), request.nextUrl.origin))
  }
  const res = NextResponse.redirect(started.url)
  res.headers.set('Cache-Control', 'no-store')
  setPendingCookie(res, await sealPending(started.pending))
  return res
}
