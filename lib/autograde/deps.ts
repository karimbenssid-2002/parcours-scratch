import 'server-only'
import { now } from '@/lib/clock'
import { aiClient } from './ai'
import { googleIdToken, limitConcurrency, remoteRun } from './runner/remote'
import { runMany } from './runner/run'
import type { Deps } from './service'

// Un exécuteur distant par adresse et clé : le même d'un appel à l'autre (son jeton Google reste en mémoire).
// Les relevés de la solution et du projet de départ sont gardés en base, pas ici.
/** Appels distants simultanés au plus par processus : le service a 10 instances à une exécution chacune. */
const MAX_REMOTE_CALLS = 10
const remote = new Map<string, Deps['run']>()

function remoteFor(url: string, saKey: string): Deps['run'] {
  const key = `${url}\n${saKey}`
  let run = remote.get(key)
  // Audience du jeton : l'adresse du service Cloud Run, telle quelle (sans barre finale).
  if (!run) remote.set(key, (run = limitConcurrency(remoteRun(url, googleIdToken(saKey, url.replace(/\/+$/, ''))), MAX_REMOTE_CALLS)))
  return run
}

/** Dépendances réelles du service de corrections : exécuteur (service distant si AUTOGRADE_RUNNER_URL est défini,
 * appelé avec un jeton Google obtenu par la clé AUTOGRADE_RUNNER_SA_KEY ; sinon Chromium local), IA Anthropic ou
 * factice. */
export function liveDeps(): Deps {
  const url = process.env.AUTOGRADE_RUNNER_URL
  const run = url ? remoteFor(url, process.env.AUTOGRADE_RUNNER_SA_KEY ?? '') : runMany
  return { run, runner: url ? 'remote' : 'local', ai: aiClient, now }
}
