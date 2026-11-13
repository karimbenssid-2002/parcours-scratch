export type ToggleState = 'hidden' | 'offer' | 'denied' | 'on'

/** Ce que le bouton de notifications montre : rien hors appli installée ou sans Web Push ; « bloquées » si la
 *  permission est refusée (même abonné, le téléphone ne livrera plus rien) ; « activées » seulement si abonné avec la clé actuelle ET connu du serveur. */
export function toggleState(input: { standalone: boolean; supported: boolean; permission: NotificationPermission; subscribed: boolean; serverKnows: boolean }): ToggleState {
  if (!input.standalone || !input.supported) return 'hidden'
  if (input.permission === 'denied') return 'denied'
  return input.subscribed && input.serverKnows ? 'on' : 'offer'
}

/** Clé publique VAPID (base64url) au format attendu par `pushManager.subscribe`. */
export function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** L'abonnement du navigateur a-t-il été fait avec la clé VAPID actuelle ? Différente (les deux connues) : non.
 *  Clé non exposée par le navigateur (iOS) : pas d'écart constaté, le contrôle serveur tranche. */
export function sameKey(subscriptionKey: ArrayBuffer | null | undefined, current: Uint8Array): boolean {
  if (!subscriptionKey) return true
  if (subscriptionKey.byteLength !== current.length) return false
  const a = new Uint8Array(subscriptionKey)
  return a.every((v, i) => v === current[i])
}

/** Android : Chrome refuse parfois l'abonnement demandé depuis l'appli installée (AbortError « push service error »)
 *  alors qu'il l'accepte dans un onglet ; l'abonnement fait dans Chrome sert ensuite aussi à l'appli. */
export function needsChromeFallback(input: { step: string; errorName: string | null; standalone: boolean; userAgent: string }): boolean {
  return input.step === 'abonnement' && input.errorName === 'AbortError' && input.standalone && /Android/i.test(input.userAgent)
}

/** Lien qui ouvre la page dans Chrome lui-même (hors de l'appli installée), avec le bouton affiché. */
export function chromeIntentUrl(host: string, pathname: string): string {
  return `intent://${host}${pathname}?notifs=chrome#Intent;scheme=https;package=com.android.chrome;end`
}
