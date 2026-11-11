import { describe, expect, it } from 'vitest'
import { nextDeadline } from '@/lib/deadlines/next'
import type { ProgressStatus } from '@/lib/db/schema'

const NOW = Date.parse('2026-10-09T10:00:00.000Z')
const item = (activityId: string, dueAt: string | null) => ({ activityId, title: `Titre ${activityId}`, dueAt })

describe('nextDeadline', () => {
  it('choisit l’échéance future la plus proche parmi les défis encore à faire', () => {
    const items = [item('a', '2026-10-20T10:00:00.000Z'), item('b', '2026-10-12T10:00:00.000Z'), item('c', null)]
    expect(nextDeadline(items, new Map(), NOW)).toEqual({ activityId: 'b', title: 'Titre b', dueAt: '2026-10-12T10:00:00.000Z' })
  })

  it('ignore les échéances passées et les défis validés, envoyés ou non rendus', () => {
    const items = [item('passe', '2026-10-01T10:00:00.000Z'), item('v', '2026-10-10T10:00:00.000Z'),
      item('s', '2026-10-10T11:00:00.000Z'), item('n', '2026-10-10T12:00:00.000Z'), item('ok', '2026-10-30T10:00:00.000Z')]
    const statuses = new Map<string, ProgressStatus>([['v', 'validated'], ['s', 'submitted'], ['n', 'not_submitted']])
    expect(nextDeadline(items, statuses, NOW)?.activityId).toBe('ok')
  })

  it('garde les défis « presque réussi » et « non réussi » (encore à reprendre)', () => {
    const items = [item('x', '2026-10-11T10:00:00.000Z')]
    expect(nextDeadline(items, new Map([['x', 'needs_work']]), NOW)?.activityId).toBe('x')
    expect(nextDeadline(items, new Map([['x', 'almost']]), NOW)?.activityId).toBe('x')
  })

  it('renvoie null s’il ne reste aucune échéance', () => {
    expect(nextDeadline([item('a', null)], new Map(), NOW)).toBeNull()
    expect(nextDeadline([], new Map(), NOW)).toBeNull()
  })
})
