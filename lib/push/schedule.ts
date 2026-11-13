import 'server-only'
import { after } from 'next/server'

/**
 * Programme un travail à faire après la réponse (`after()`), sans jamais lever ni faire échouer l'appelant.
 * Hors requête (script, test), `after()` n'est pas disponible : le travail est lancé directement, erreurs avalées.
 */
export function schedule(fn: () => Promise<void>): void {
  const run = async () => { try { await fn() } catch { console.error('[notifications] erreur interne') } }
  try {
    after(run)
  } catch {
    void run()
  }
}
