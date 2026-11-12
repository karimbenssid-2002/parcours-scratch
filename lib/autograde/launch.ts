import 'server-only'
import { after } from 'next/server'
import type { DB } from '@/lib/db/client'
import { getDb } from '@/lib/db/client'
import { relaunchSecret } from './enabled'
import { liveDeps } from './deps'
import { drainQueue, needsDrain, recoverStuck } from './queue'

/** Une fonction Vercel dure au plus 300 s (maxDuration des routes et pages qui lancent la file). Les prises de copies
 * s'arrêtent 150 s après le début de l'appel : une copie prise juste avant a encore ~150 s pour finir. Une copie qui
 * dure plus de ~2 min 30 risque d'être coupée (elle est alors reprise, et compte comme une tentative). */
export const CLAIM_BUDGET_MS = 150_000
export const RELAUNCH_PATH = '/api/correction/continuer'

/** Origine https://hôte, sans chemin ni paramètres, ou null. */
function httpsOrigin(value: string): string | null {
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * Adresse du site, où envoyer la relance (et donc le secret). Jamais d'après la requête en ligne : un en-tête Host
 * falsifié enverrait le secret ailleurs.
 * 1. AUTOGRADE_SITE_URL (https://…, sans chemin) ;
 * 2. sur Vercel : https://${VERCEL_PROJECT_PRODUCTION_URL} (domaine de production, fourni par Vercel) ;
 * 3. en développement seulement (ni Vercel ni NODE_ENV=production) : l'hôte de la requête.
 */
export function siteOrigin(h: Headers | null): string | null {
  const configured = process.env.AUTOGRADE_SITE_URL
  if (configured) return httpsOrigin(configured)
  if (process.env.VERCEL) {
    const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
    return prod ? httpsOrigin(`https://${prod}`) : null
  }
  if (process.env.NODE_ENV === 'production' || !h) return null
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null
  const proto = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : (h.get('x-forwarded-proto') ?? 'https').split(',')[0].trim()
  return proto === 'http' || proto === 'https' ? `${proto}://${host}` : null
}

/** Appelle la route de relance : elle répond tout de suite et vide la suite de la file dans une nouvelle fonction.
 * Vrai seulement si elle a accepté (2xx) ; un délai dépassé compte comme un échec (au pire une fonction en double). */
async function relaunch(origin: string | null): Promise<boolean> {
  const secret = relaunchSecret()
  if (!secret) {
    console.warn('Correction automatique : relance impossible sans AUTOGRADE_RELAUNCH_SECRET ; la suite reprendra au prochain suivi de l’état ou à la tâche quotidienne.')
    return false
  }
  if (!origin) {
    console.warn('Correction automatique : relance impossible, adresse du site inconnue (AUTOGRADE_SITE_URL, https://… sans chemin).')
    return false
  }
  try {
    const res = await fetch(`${origin}${RELAUNCH_PATH}`, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) console.error(`Correction automatique : relance refusée (code ${res.status})`)
    return res.ok
  } catch (e) {
    console.error(`Correction automatique : relance impossible (${e instanceof Error ? e.name : 'erreur'})`)
    return false
  }
}

/**
 * Vide la file après la réponse (after() : la fonction continue même si l'enseignant ferme son navigateur). Les prises
 * s'arrêtent 150 s après `startedAt`, le début de l'appel (pas l'heure de cet appel-ci) ; la suite est relancée par la
 * route protégée s'il reste des copies. `h` : en-têtes de la requête, utilisés seulement en développement.
 */
export function scheduleDrain(startedAt: number, h: Headers | null): void {
  const deadline = startedAt + CLAIM_BUDGET_MS
  const origin = siteOrigin(h)
  after(async () => {
    try {
      await drainQueue(getDb(), liveDeps(), { deadline, relaunch: () => relaunch(origin) })
    } catch (e) {
      console.error(`Correction automatique : file interrompue (${e instanceof Error ? e.name : 'erreur'})`)
    }
  })
}

// Le suivi de l'état est interrogé chaque seconde par chaque onglet ouvert : la reprise des copies bloquées n'y est
// faite qu'une fois toutes les 30 s par processus (chaque fonction de la file la fait aussi en démarrant).
const RECOVER_EVERY_MS = 30_000
const net = globalThis as unknown as { __autogradeLastRecover?: number }

export function resetSafetyNetForTests(): void {
  net.__autogradeLastRecover = undefined
}

/** Filet de sécurité du suivi de l'état : reprise des copies bloquées (limitée), puis file relancée si elle est arrêtée. */
export async function pollSafetyNet(db: DB, now: Date, startedAt: number, h: Headers | null): Promise<void> {
  const last = net.__autogradeLastRecover
  let recovered = 0
  if (last === undefined || startedAt - last >= RECOVER_EVERY_MS) {
    net.__autogradeLastRecover = startedAt
    recovered = await recoverStuck(db, now)
  }
  // Copie remise en file : une fonction la prend, même si une autre semble au travail (elle a pu passer son échéance).
  if (recovered > 0 || (await needsDrain(db, now))) scheduleDrain(startedAt, h)
}
