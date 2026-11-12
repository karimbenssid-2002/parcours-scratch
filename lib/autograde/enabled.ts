/** Correction automatique active : AUTOGRADE_ENABLED=1, et un moyen d'exécuter les programmes :
 * - le service d'exécution distant (AUTOGRADE_RUNNER_URL, appelé avec la clé de compte de service
 *   AUTOGRADE_RUNNER_SA_KEY ; en ligne : Cloud Run) ;
 * - ou Chromium en local, à condition que le build l'ait gardé : AUTOGRADE_AU_BUILD est remplacé au build par « 0 »
 *   quand Chromium et l'éditeur Scratch sont écartés du code déployé (next.config.ts : correction désactivée ou service
 *   distant au build, ou build sur Vercel), même si les variables sont définies à l'exécution.
 * Sur Vercel, il faut aussi le secret de relance de la file (AUTOGRADE_RELAUNCH_SECRET) : sans lui, une classe entière ne
 * se corrigerait pas navigateur fermé. */
export function autogradeEnabled(): boolean {
  if (process.env.AUTOGRADE_ENABLED !== '1') return false
  if (process.env.VERCEL && !relaunchSecret()) return false
  if (process.env.AUTOGRADE_RUNNER_URL) return !!process.env.AUTOGRADE_RUNNER_SA_KEY
  return process.env.AUTOGRADE_AU_BUILD !== '0'
}

const MIN_RELAUNCH_SECRET = 32

/** Secret de la route de relance de la file (côté site, distinct de l'accès au service d'exécution), s'il est assez long. */
export function relaunchSecret(): string | null {
  const s = process.env.AUTOGRADE_RELAUNCH_SECRET ?? ''
  return s.length >= MIN_RELAUNCH_SECRET ? s : null
}

export const AUTOGRADE_UNAVAILABLE = 'Correction automatique non disponible sur ce site.'
