import type { ProgressStatus } from '@/lib/db/schema'
import { canEdit } from '@/lib/progress/rules'

export type NextDeadline = { activityId: string; title: string; dueAt: string }

/** Échéance future la plus proche parmi les défis que l'élève peut encore travailler ; null s'il n'y en a pas. */
export function nextDeadline(
  items: { activityId: string; title: string; dueAt: string | null }[],
  statuses: Map<string, ProgressStatus>,
  nowMs: number,
): NextDeadline | null {
  let best: NextDeadline | null = null
  for (const { activityId, title, dueAt } of items) {
    if (!dueAt || Date.parse(dueAt) <= nowMs) continue
    if (!canEdit(statuses.get(activityId) ?? 'not_started')) continue
    if (!best || Date.parse(dueAt) < Date.parse(best.dueAt)) best = { activityId, title, dueAt }
  }
  return best
}
