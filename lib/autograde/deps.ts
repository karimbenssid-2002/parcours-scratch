import 'server-only'
import { now } from '@/lib/clock'
import { aiClient } from './ai'
import { runMany } from './runner/run'
import type { Deps } from './service'

/** Dépendances réelles du service de corrections (exécuteur Chromium, IA Anthropic ou factice). */
export function liveDeps(): Deps {
  return { run: runMany, ai: aiClient, now }
}
