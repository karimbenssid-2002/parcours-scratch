import type { ProgressStatus } from '@/lib/db/schema'

export type NextStepKind = 'correct' | 'continue' | 'start'

/** Défi à mettre en avant sur l'accueil élève : d'abord une correction demandée par le professeur,
 *  puis un défi commencé, puis le premier défi pas encore commencé (dans l'ordre du parcours). */
export function nextStep<T extends { activityId: string }>(
  items: T[],
  statuses: Map<string, ProgressStatus>,
): { item: T; kind: NextStepKind } | null {
  const status = (i: T) => statuses.get(i.activityId) ?? 'not_started'
  const correct = items.find((i) => status(i) === 'almost' || status(i) === 'needs_work')
  if (correct) return { item: correct, kind: 'correct' }
  const running = items.find((i) => status(i) === 'in_progress')
  if (running) return { item: running, kind: 'continue' }
  const fresh = items.find((i) => status(i) === 'not_started')
  return fresh ? { item: fresh, kind: 'start' } : null
}
