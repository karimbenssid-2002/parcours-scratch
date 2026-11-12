import { and, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { DB } from './client'
import { activityAutograde, ACTIVE_JOB_STATUSES, appSettings, autogradeJobs, autogradeRunnerCalls } from './schema'
import type { KeyPress } from '@/lib/autograde/runner/types'

export type AutogradeConfig = { activityId: string; solutionPath: string; solutionFormat: 'sb3' | 'sb2'; criteria: string[]; answers: string[]; keys: KeyPress[]; durationMs: number }
export type AutogradeModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5'
export const AUTOGRADE_MODELS: AutogradeModel[] = ['claude-haiku-5-5', 'claude-sonnet-5-5']
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

type SettingKey = 'autograde_model' | 'autograde_monthly_cap' | 'autograde_effort'
export async function getSetting(db: Pick<DB, 'select'>, key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}
export async function setSetting(db: DB, key: SettingKey, value: string): Promise<void> {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}
export async function autogradeModel(db: DB): Promise<AutogradeModel> {
  const v = await getSetting(db, 'autograde_model')
  return (AUTOGRADE_MODELS as string[]).includes(v ?? '') ? (v as AutogradeModel) : 'claude-haiku-5-5'
}

// ---------------------------------------------------------------- niveau de réflexion de Claude
export const AUTOGRADE_EFFORTS = ['low', 'medium', 'high'] as const
export type AutogradeEffort = (typeof AUTOGRADE_EFFORTS)[number]
/** Valeur inconnue ou absente : « low ». (« xhigh » et « max » ne sont jamais proposés.) */
export const toEffort = (v: unknown): AutogradeEffort => ((AUTOGRADE_EFFORTS as readonly unknown[]).includes(v) ? (v as AutogradeEffort) : 'low')
export async function autogradeEffort(db: DB): Promise<AutogradeEffort> {
  return toEffort(await getSetting(db, 'autograde_effort'))
}
export async function saveEffort(db: DB, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(AUTOGRADE_EFFORTS as readonly string[]).includes(raw)) return { ok: false, error: 'Niveau de réflexion inconnu.' }
  await setSetting(db, 'autograde_effort', raw)
  return { ok: true }
}

// ---------------------------------------------------------------- plafond mensuel d'exécutions (Cloud Run)
export const DEFAULT_MONTHLY_CAP = 8000
export const MAX_MONTHLY_CAP = 100_000
export const QUOTA_MESSAGE = 'Quota mensuel de corrections automatiques atteint : correction manuelle uniquement jusqu’au mois prochain.'

export async function monthlyCap(db: Pick<DB, 'select'>): Promise<number> {
  const v = await getSetting(db, 'autograde_monthly_cap')
  return v !== null && /^\d{1,6}$/.test(v) && Number(v) <= MAX_MONTHLY_CAP ? Number(v) : DEFAULT_MONTHLY_CAP
}
export async function saveMonthlyCap(db: DB, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{1,6}$/.test(raw) || Number(raw) > MAX_MONTHLY_CAP) return { ok: false, error: 'Le plafond doit être un nombre entier de 0 à 100 000.' }
  await setSetting(db, 'autograde_monthly_cap', String(Number(raw)))
  return { ok: true }
}

/** Exécutions envoyées au service (tous types) pendant le mois civil UTC de `now`, leur durée totale, et le plafond. */
export async function monthlyUsage(db: Pick<DB, 'select'>, now: Date): Promise<{ used: number; cap: number; durationMs: number }> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  const [row] = await db.select({ used: sql<number>`count(*)::int`, durationMs: sql<number>`coalesce(sum(${autogradeRunnerCalls.durationMs}), 0)::int` })
    .from(autogradeRunnerCalls).where(and(gte(autogradeRunnerCalls.at, from), lt(autogradeRunnerCalls.at, to)))
  return { used: row.used, cap: await monthlyCap(db), durationMs: row.durationMs }
}

/**
 * État du plafond : exécutions déjà envoyées ce mois-ci (`used`), copies en file ou en cours qui vont encore en envoyer (`active`),
 * et ce qu'il reste (`remaining`). Source unique pour les demandes et pour l'état des boutons et de la page.
 * Le plafond compte les copies demandées : les relevés de référence (solution, départ ; gardés après un premier succès) et les
 * nouvelles tentatives peuvent ajouter des exécutions, la vérification est donc volontairement approximative ;
 * le décompte exact est `autograde_runner_calls`.
 */
export async function quotaState(db: Pick<DB, 'select'>, now: Date): Promise<{ used: number; active: number; cap: number; remaining: number; durationMs: number }> {
  const u = await monthlyUsage(db, now)
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(autogradeJobs).where(inArray(autogradeJobs.status, [...ACTIVE_JOB_STATUSES]))
  return { ...u, active: n, remaining: Math.max(0, u.cap - u.used - n) }
}

/** Message de refus si `requested` copies ne tiennent plus dans le plafond, sinon null. */
export const quotaBlock = (q: { remaining: number }, requested: number): string | null => (requested > q.remaining ? QUOTA_MESSAGE : null)
