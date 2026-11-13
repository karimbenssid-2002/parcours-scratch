/** Web Push : actif seulement si les deux clés VAPID sont renseignées et le sujet (s'il est donné) valide. */
type Env = Record<string, string | undefined>

const validSubject = (s: string) => s.startsWith('mailto:') || s.startsWith('https://')
let warnedSubject = false

export function pushEnabled(env: Env = process.env): boolean {
  if (!(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim())) return false
  if (!vapidSubject(env)) {
    if (!warnedSubject) {
      warnedSubject = true
      console.warn('[notifications] sujet VAPID absent ou invalide (VAPID_SUBJECT, AUTOGRADE_SITE_URL ou domaine Vercel attendu) : notifications désactivées.')
    }
    return false
  }
  return true
}

/** Clé publique (applicationServerKey du navigateur), ou null si les notifications sont désactivées. */
export function vapidPublicKey(): string | null {
  return pushEnabled() ? process.env.VAPID_PUBLIC_KEY!.trim() : null
}

/** Contact du serveur d'envoi : VAPID_SUBJECT valide, sinon l'adresse du site (AUTOGRADE_SITE_URL, puis domaine de production Vercel) ; null si aucun. */
export function vapidSubject(env: Env = process.env): string | null {
  const explicit = env.VAPID_SUBJECT?.trim()
  if (explicit) return validSubject(explicit) ? explicit : null
  const site = env.AUTOGRADE_SITE_URL?.trim()
  if (site?.startsWith('https://')) return site
  if (site) return `https://${site.replace(/^https?:\/\//, '').split('/')[0]}`
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (prod) return `https://${prod.replace(/^https?:\/\//, '').split('/')[0]}`
  return null
}
