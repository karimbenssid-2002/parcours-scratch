import { eq, isNotNull } from 'drizzle-orm'
import type { DB } from './client'
import { activityAutograde, appSettings } from './schema'
import type { KeyPress } from '@/lib/autograde/runner/types'

export type AutogradeConfig = { activityId: string; solutionPath: string; solutionFormat: 'sb3' | 'sb2'; criteria: string[]; answers: string[]; keys: KeyPress[]; durationMs: number }
export type AutogradeModel = 'claude-haiku-4-5' | 'claude-sonnet-5-5'
export const AUTOGRADE_MODELS: AutogradeModel[] = ['claude-haiku-4-5', 'claude-sonnet-5-5']
// Touches acceptées : celles de Scratch (lettres, chiffres, espace, flèches).
const KEY = /^([a-z0-9]|space|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Enter| )$/

const parse = <T>(s: string): T => JSON.parse(s) as T

async function autogradeRow(db: DB, activityId: string) {
  const [row] = await db.select().from(activityAutograde).where(eq(activityAutograde.activityId, activityId)).limit(1)
  return row
}

export async function getAutogradeConfig(db: DB, activityId: string): Promise<AutogradeConfig | null> {
  const r = await autogradeRow(db, activityId)
  if (!r || !r.solutionPath || !r.solutionFormat) return null
  return { activityId, solutionPath: r.solutionPath, solutionFormat: r.solutionFormat, criteria: parse(r.criteria), answers: parse(r.answers), keys: parse(r.keys), durationMs: r.durationMs }
}

export async function getAutogradeDraft(db: DB, activityId: string) {
  const r = await autogradeRow(db, activityId)
  return r ? { hasSolution: !!r.solutionPath, solutionFormat: r.solutionFormat, criteria: parse<string[]>(r.criteria), answers: parse<string[]>(r.answers), keys: parse<KeyPress[]>(r.keys), durationMs: r.durationMs } : null
}

export async function isAutogradeReady(db: DB, activityId: string): Promise<boolean> {
  return ((await getAutogradeConfig(db, activityId))?.criteria.length ?? 0) > 0
}

export async function readyActivityIds(db: DB): Promise<Set<string>> {
  return new Set((await db.select().from(activityAutograde).where(isNotNull(activityAutograde.solutionPath)))
    .filter((r) => parse<string[]>(r.criteria).length > 0).map((r) => r.activityId))
}

export async function saveAutogradeSettings(db: DB, activityId: string, input: { criteria: string[]; answers: string[]; keys: KeyPress[]; durationMs: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const criteria = input.criteria.map((c) => c.trim()).filter(Boolean)
  if (criteria.length < 1 || criteria.length > 8) return { ok: false, error: 'Indiquez entre 1 et 8 critères de réussite.' }
  if (criteria.some((c) => c.length > 800)) return { ok: false, error: 'Un critère ne doit pas dépasser 800 caractères.' }
  const answers = input.answers.map((a) => a.trim()).filter(Boolean).slice(0, 20)
  if (answers.some((a) => a.length > 100)) return { ok: false, error: 'Une réponse de test ne doit pas dépasser 100 caractères.' }
  if (input.keys.some((k) => !KEY.test(k.key) || !Number.isInteger(k.times) || k.times < 1 || k.times > 20)) return { ok: false, error: 'Touches de test invalides.' }
  if (!Number.isInteger(input.durationMs) || input.durationMs < 2_000 || input.durationMs > 60_000) return { ok: false, error: 'La durée doit être comprise entre 2 et 60 secondes.' }
  const values = { criteria: JSON.stringify(criteria), answers: JSON.stringify(answers), keys: JSON.stringify(input.keys), durationMs: input.durationMs, updatedAt: new Date().toISOString() }
  await db.insert(activityAutograde).values({ activityId, ...values }).onConflictDoUpdate({ target: activityAutograde.activityId, set: values })
  return { ok: true }
}

export async function setSolution(db: DB, activityId: string, path: string, format: 'sb3' | 'sb2'): Promise<void> {
  const values = { solutionPath: path, solutionFormat: format, updatedAt: new Date().toISOString() }
  await db.insert(activityAutograde).values({ activityId, ...values }).onConflictDoUpdate({ target: activityAutograde.activityId, set: values })
}

export async function getSetting(db: DB, key: 'autograde_model'): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}
export async function setSetting(db: DB, key: 'autograde_model', value: string): Promise<void> {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}
export async function autogradeModel(db: DB): Promise<AutogradeModel> {
  const v = await getSetting(db, 'autograde_model')
  return (AUTOGRADE_MODELS as string[]).includes(v ?? '') ? (v as AutogradeModel) : 'claude-haiku-4-5'
}
