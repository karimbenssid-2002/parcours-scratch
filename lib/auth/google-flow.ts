import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { PENDING_COOKIE, PENDING_MAX_AGE } from '@/lib/auth/google'
import type { SessionCookie } from '@/lib/auth/session'
import { safeMessage } from '@/lib/db/safe-message'

// Outils communs aux routes /auth/* (départ et retour de Google, connexion de développement).

/** Adresse de retour déclarée chez Google : l'origine de la requête (sur Vercel, l'hôte visité). */
export function callbackUrl(request: NextRequest): string {
  return new URL('/auth/google/callback', request.nextUrl.origin).toString()
}

export function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
}

/** Cookie de la connexion en cours : envoyé au retour de Google (navigation venue d'un autre site → SameSite=Lax). */
const pendingOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/auth/google',
})

export function setPendingCookie(res: NextResponse, value: string): void {
  res.cookies.set(PENDING_COOKIE, value, { ...pendingOptions(), maxAge: PENDING_MAX_AGE })
}

export function clearPendingCookie(res: NextResponse): void {
  res.cookies.delete({ name: PENDING_COOKIE, ...pendingOptions() })
}

export function setSessionCookie(res: NextResponse, c: SessionCookie): void {
  res.cookies.set(c.name, c.value, c.options)
}

/**
 * Page de relais vers `path` (chemin fixe du site, jamais fourni par l'utilisateur). Une redirection HTTP depuis le
 * retour de Google garderait une navigation partie de Google : le navigateur n'y joindrait pas le cookie de session
 * (SameSite=Strict) et la page suivante se croirait déconnectée. Le rafraîchissement part, lui, de notre site.
 */
export type RelayPath = '/' | '/admin'

export function relayHtml(path: RelayPath): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Connexion…</title></head>`
    + `<body><p><a href="${path}">Continuer</a></p></body></html>`
}

/**
 * Une ligne de journal par échec de connexion Google, préfixée `[connexion Google]` : la cause seule, courte et non
 * personnelle. Jamais l'adresse, le code d'autorisation, un jeton ni le secret.
 */
export function logGoogleFailure(detail: string): void {
  console.error(`[connexion Google] ${detail}`)
}

/**
 * Cause d'une erreur de base (ou autre erreur serveur) pour ce journal : message seul via safeMessage, celui du pilote
 * plutôt que celui de Drizzle (« Failed query… params: » cite les paramètres, donc l'adresse), toute adresse masquée.
 */
export function serverErrorDetail(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error && /^Failed query:/.test(e.message) ? e.cause : e
  return safeMessage(cause).replace(/[^\s@'"(),;:<>=]+@[^\s@'"(),;:<>=]+/g, '[adresse]').replace(/\s+/g, ' ').slice(0, 200)
}
