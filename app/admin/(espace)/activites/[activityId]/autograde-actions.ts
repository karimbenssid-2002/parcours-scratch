'use server'
import { AUTOGRADE_UNAVAILABLE, autogradeEnabled } from '@/lib/autograde/enabled'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getAutogradeConfig, saveAutogradeSettings } from '@/lib/db/autograde'
import { parseKeys } from '@/lib/autograde/keys'
import { sameTraces, summarizeTraces } from '@/lib/autograde/compare'
import { DEFAULT_ANSWERS, DEFAULT_KEYS } from '@/lib/autograde/runner/defaults'
import { liveDeps } from '@/lib/autograde/deps'
import { timedRun } from '@/lib/db/autograde-runs'
import { readStored } from '@/lib/storage/files'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AutogradeInput = { criteria: string[]; answers: string; keys: string; durationSeconds: number }

export async function saveAutogradeAction(activityId: string, input: AutogradeInput): Promise<{ error?: string; success?: string }> {
  await requireTeacher({ role: 'admin' })
  if (!UUID.test(activityId)) return { error: 'Activité introuvable.' }
  const keys = parseKeys(input.keys)
  if (!keys.ok) return { error: keys.error }
  const result = await saveAutogradeSettings(getDb(), activityId, {
    criteria: input.criteria,
    answers: input.answers.split('\n'),
    keys: keys.keys,
    durationMs: Math.round(Number(input.durationSeconds) * 1000),
  })
  if (!result.ok) return { error: result.error }
  revalidatePath(`/admin/activites/${activityId}`)
  revalidatePath('/admin/activites')
  return { success: 'Correction automatique enregistrée.' }
}

/** Exécute la solution contre elle-même : montre ce que le site relève, sans aucun appel à l'IA. */
export async function testAutogradeAction(activityId: string): Promise<{ error?: string; summary?: string; identical?: boolean }> {
  await requireTeacher({ role: 'admin' })
  if (!autogradeEnabled()) return { error: AUTOGRADE_UNAVAILABLE }
  if (!UUID.test(activityId)) return { error: 'Activité introuvable.' }
  const config = await getAutogradeConfig(getDb(), activityId)
  if (!config) return { error: 'Enregistrez d’abord une solution de référence.' }
  const bytes = await readStored(config.solutionPath)
  if (!bytes) return { error: 'Solution de référence introuvable.' }
  try {
    const base = { answers: config.answers.length ? config.answers : DEFAULT_ANSWERS, keys: config.keys.length ? config.keys : DEFAULT_KEYS, durationMs: config.durationMs }
    const { traces } = await timedRun(getDb(), liveDeps(), 'test', null, new Uint8Array(bytes), base) // service distant en ligne (compté dans le plafond), Chromium en local
    const error = traces.find((t) => t.error)?.error
    if (error) return { error: `La solution n’a pas pu être exécutée : ${error}` }
    return { summary: summarizeTraces(traces), identical: sameTraces(traces, traces.map(() => traces[0])) }
  } catch {
    return { error: 'L’exécution a échoué (navigateur d’exécution indisponible).' }
  }
}
