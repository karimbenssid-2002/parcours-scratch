import { NextResponse, type NextRequest } from 'next/server'
import { getDb, type DB } from '@/lib/db/client'
import { finishGoogleLogin, GoogleLoginError, oauthErrorCode, openPending, PENDING_COOKIE } from '@/lib/auth/google'
import {
  callbackUrl, clearPendingCookie, clientIp, logGoogleFailure, relayHtml, serverErrorDetail, setSessionCookie, type RelayPath,
} from '@/lib/auth/google-flow'
import { studentGoogleLogin, teacherGoogleLogin } from '@/lib/auth/google-login'
import { checkGoogleIdentity, type GoogleIdentity, type LoginKind } from '@/lib/auth/identity'
import { isBlocked } from '@/lib/auth/limits'
import { loginPath, type LoginError } from '@/lib/auth/login-errors'
import { adminSessionCookie, studentSessionCookie } from '@/lib/auth/session'

// Retour de Google. Toute issue efface le cookie de la connexion en cours ; le succès mène toujours à l'accueil
// du rôle (aucun paramètre de destination n'est lu). Chaque échec laisse une ligne de journal « [connexion Google] … »
// (logGoogleFailure) ; ni l'adresse, ni le code, ni un jeton, ni le secret ne sont journalisés.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const q = request.nextUrl.searchParams
  const toLogin = (kind: LoginKind, error?: LoginError) => {
    const res = NextResponse.redirect(new URL(loginPath(kind, error), origin))
    res.headers.set('Cache-Control', 'no-store')
    clearPendingCookie(res)
    return res
  }

  const sealed = request.cookies.get(PENDING_COOKIE)?.value
  const pending = sealed ? await openPending(sealed) : null
  // Sans connexion en cours (autre navigateur, cookie expiré), le rôle est inconnu : page élève par défaut.
  if (!pending) {
    logGoogleFailure(`retour sans connexion en cours (cookie ${sealed ? 'invalide ou expiré' : 'absent'})`)
    return toLogin('eleve', 'expire')
  }
  const kind = pending.kind
  const googleError = q.get('error')
  if (googleError !== null) {
    // Refus chez Google (access_denied quand on annule, admin_policy_enforced…) : sa valeur seule, si elle en a la forme.
    logGoogleFailure(`erreur renvoyée par Google : ${oauthErrorCode(googleError) ?? 'valeur inattendue'} (rôle ${kind})`)
    return toLogin(kind, googleError === 'access_denied' ? undefined : 'echec') // annulé : page de connexion sans message
  }
  const code = q.get('code')
  if (q.get('state') !== pending.state || !code) {
    logGoogleFailure(`retour refusé : ${code ? 'state différent' : 'code absent'} (rôle ${kind})`)
    return toLogin(kind, 'expire')
  }

  const db = getDb()
  try {
    if (await isBlocked(db, 'google', { ip: clientIp(request) })) return toLogin(kind, 'trop')
  } catch (e) {
    logGoogleFailure(`base (limite de tentatives) : ${serverErrorDetail(e)}`)
    return toLogin(kind, 'echec')
  }

  let identity: GoogleIdentity
  try {
    identity = await finishGoogleLogin(code, pending, callbackUrl(request))
  } catch (e) {
    logGoogleFailure(e instanceof GoogleLoginError ? e.detail : `échange du code : ${serverErrorDetail(e)}`)
    return toLogin(kind, 'echec')
  }

  try {
    return await decide(db, kind, identity, toLogin)
  } catch (e) {
    // Base indisponible, etc. : pas de page d'erreur 500, et le cookie de connexion en cours est effacé.
    logGoogleFailure(`base (rôle ${kind}) : ${serverErrorDetail(e)}`)
    return toLogin(kind, 'echec')
  }
}

/** Règle du rôle, une fois l'identité Google obtenue. */
async function decide(db: DB, kind: LoginKind, identity: GoogleIdentity, toLogin: (k: LoginKind, e?: LoginError) => NextResponse) {
  const checked = checkGoogleIdentity(identity, kind)
  if (!checked.ok) {
    // Pour régler les domaines acceptés (ex. mlfmonde.org domaine secondaire d'une autre organisation) : sans l'adresse.
    if (checked.reason === 'domaine') console.warn(`[connexion Google] refus (domaine) : rôle ${kind}, ${identity.hd ? `hd ${identity.hd}` : 'aucun hd'}`)
    return toLogin(kind, checked.reason)
  }

  const res = (path: RelayPath) => {
    const r = new NextResponse(relayHtml(path), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    clearPendingCookie(r)
    return r
  }
  if (kind === 'eleve') {
    const r = await studentGoogleLogin(db, checked.email)
    if (!r.ok) return toLogin(kind, r.reason)
    const out = res('/')
    setSessionCookie(out, await studentSessionCookie(r.student))
    return out
  }
  const r = await teacherGoogleLogin(db, checked.email)
  if (!r.ok) return toLogin(kind, r.reason)
  const out = res('/admin')
  setSessionCookie(out, await adminSessionCookie(r.teacher))
  return out
}
