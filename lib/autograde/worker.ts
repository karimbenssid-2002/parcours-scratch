import 'server-only'
import { getDb } from '@/lib/db/client'
import { runMany } from './runner/run'
import { aiClient } from './ai'
import { processQueued, processRuns, recoverJobs } from './service'
import { now } from '@/lib/clock'

const store = globalThis as unknown as { __autogradeWorker?: boolean }

/** Boucle unique par processus : exécutions toutes les secondes, lots IA toutes les 30 s. */
export function ensureWorker(): void {
  if (store.__autogradeWorker || process.env.AUTOGRADE_WORKER === 'off') return
  store.__autogradeWorker = true
  const db = getDb()
  const deps = { run: runMany, ai: aiClient, now }
  let busy = false
  let lastRuns = 0
  void recoverJobs(db, deps, { startup: true })
  setInterval(async () => {
    if (busy) return
    busy = true
    try {
      await recoverJobs(db, deps) // tâche bloquée depuis plus de 5 minutes
      await processQueued(db, deps)
      if (Date.now() - lastRuns > 30_000 || process.env.AUTOGRADE_FAKE_AI === '1') { lastRuns = Date.now(); await processRuns(db, deps) }
    } catch (e) {
      console.error('Correction automatique :', e instanceof Error ? e.message : e) // jamais de contenu élève ni de clé
    } finally {
      busy = false
    }
  }, 1_000).unref?.()
}
