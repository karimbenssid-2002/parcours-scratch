import { describe, expect, it } from 'vitest'
import type { ProgressStatus } from '@/lib/db/schema'
import { nextStep } from '@/lib/progress/next-step'

const items = ['a', 'b', 'c', 'd'].map((activityId) => ({ activityId }))
const st = (o: Record<string, ProgressStatus>) => new Map(Object.entries(o))

describe('nextStep', () => {
  it('met en avant une correction demandée avant tout le reste', () => {
    expect(nextStep(items, st({ a: 'in_progress', c: 'almost' }))).toEqual({ item: items[2], kind: 'correct' })
    expect(nextStep(items, st({ b: 'needs_work' }))?.kind).toBe('correct')
  })
  it('sinon un défi commencé, puis le premier pas commencé', () => {
    expect(nextStep(items, st({ a: 'validated', c: 'in_progress' }))).toEqual({ item: items[2], kind: 'continue' })
    expect(nextStep(items, st({ a: 'validated', b: 'submitted' }))).toEqual({ item: items[2], kind: 'start' })
  })
  it('rien quand tout est envoyé, validé ou non rendu', () => {
    expect(nextStep(items, st({ a: 'validated', b: 'submitted', c: 'not_submitted', d: 'validated' }))).toBeNull()
    expect(nextStep([], st({}))).toBeNull()
  })
})
