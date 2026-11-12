import { like } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { autogradeJobs, autogradeUsage } from '@/lib/db/schema'

// Tarifs publics en dollars par million de tokens (entrée, sortie, lecture du cache, écriture du cache) ; les anciennes lignes de lot (historique) comptent moitié prix.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }, // historique
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
}

export type MonthlyUsage = {
  corrections: number; withoutAi: number; aiCalls: number
  inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number; costUsd: number
}

/** Consommation d'un mois (« 2026-10 ») : corrections lancées, tranchées sans IA, appels à l'IA, tokens, coût estimé. */
export async function monthlyUsage(db: DB, month: string): Promise<MonthlyUsage> {
  const jobs = await db.select({ result: autogradeJobs.result }).from(autogradeJobs).where(like(autogradeJobs.createdAt, `${month}%`))
  const rows = await db.select().from(autogradeUsage).where(like(autogradeUsage.createdAt, `${month}%`))
  const sum = (k: 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'outputTokens') => rows.reduce((n, r) => n + r[k], 0)
  const costUsd = rows.reduce((total, r) => {
    const p = PRICES[r.model] ?? PRICES['claude-sonnet-5-5']
    const cost = (r.inputTokens * p.input + r.outputTokens * p.output + r.cacheReadTokens * p.cacheRead + r.cacheWriteTokens * p.cacheWrite) / 1e6
    return total + (r.batch ? cost / 2 : cost)
  }, 0)
  return {
    corrections: jobs.length,
    withoutAi: jobs.filter((j) => j.result && (JSON.parse(j.result) as { source?: string }).source === 'tests').length,
    aiCalls: rows.length,
    inputTokens: sum('inputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'), outputTokens: sum('outputTokens'),
    costUsd,
  }
}
