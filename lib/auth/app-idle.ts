/**
 * Appli installée (écran d'accueil du téléphone) : déconnexion après 5 minutes fermée.
 *
 * L'appli pose `app_mode_<espace>` (cookie lisible, sans valeur secrète) ; tant qu'elle est à l'écran, elle signale sa
 * présence chaque minute et une dernière fois à sa fermeture, ce qui renouvelle `app_seen_<espace>`. À l'ouverture
 * suivante, le proxy compare ce dernier passage à l'heure : plus de 5 minutes → session effacée avant tout affichage.
 * Le dernier passage est signé et lié au jeton de session : impossible à prolonger à la main, et une nouvelle connexion
 * repart de zéro (un passage d'une session précédente ne compte pas).
 */
export type AppArea = 'admin' | 'eleve'

export const APP_IDLE_MS = 5 * 60_000
export const appModeCookie = (area: AppArea) => `app_mode_${area}`
export const appSeenCookie = (area: AppArea) => `app_seen_${area}`
/** Durée de vie du cookie de passage : au-delà, il n'a plus d'intérêt. */
export const APP_SEEN_MAX_AGE = 24 * 3600

async function hmac(secret: Uint8Array, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))
  let out = ''
  for (const b of sig) out += b.toString(16).padStart(2, '0')
  return out
}

/** Valeur du cookie de passage : `<horodatage ms>.<signature>` (signature liée au jeton de session). */
export async function signSeen(nowMs: number, sessionToken: string, secret: Uint8Array): Promise<string> {
  return `${nowMs}.${await hmac(secret, `${nowMs}.${sessionToken}`)}`
}

/** Horodatage du dernier passage, ou null s'il est absent, falsifié ou d'une autre session. */
export async function readSeen(value: string | undefined, sessionToken: string, secret: Uint8Array): Promise<number | null> {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const ts = Number(value.slice(0, dot))
  if (!Number.isSafeInteger(ts)) return null
  const expected = await hmac(secret, `${ts}.${sessionToken}`)
  return value.slice(dot + 1) === expected ? ts : null
}

/** Session à fermer ? Seulement dans l'appli installée, avec un dernier passage connu de plus de 5 minutes. */
export function appIdleExpired(input: { appMode: boolean; seenMs: number | null; nowMs: number }): boolean {
  return input.appMode && input.seenMs !== null && input.nowMs - input.seenMs > APP_IDLE_MS
}

/** Espace concerné par une adresse : /admin… pour l'appli enseignant, le reste pour l'appli élève. */
export function areaOf(pathname: string): AppArea {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'eleve'
}
