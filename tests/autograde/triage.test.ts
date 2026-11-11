import { describe, expect, it } from 'vitest'
import type { RunTrace } from '@/lib/autograde/runner/types'
import { differences, sameTraces, summarizeTraces } from '@/lib/autograde/compare'
import { triage } from '@/lib/autograde/triage'
import type { ProjectJson } from '@/lib/autograde/project-text'

const trace = (over: Partial<RunTrace> = {}): RunTrace => ({ finished: true, timedOut: false, error: null, says: [{ sprite: 'Chat', text: 'Bonjour', t: 10 }], questions: [], variables: {}, lists: {}, sprites: [{ name: 'Chat', x: 0, y: 0, direction: 90, visible: true, costume: 'c1', size: 100 }], costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' }, ...over })
const five = (t: RunTrace) => [1, 2, 3, 4, 5].map(() => t)
const proj = (blocks: Record<string, unknown>): ProjectJson => ({ targets: [{ isStage: true, name: 'Stage', blocks: {}, costumes: [], sounds: [], variables: {}, lists: {} }, { isStage: false, name: 'Chat', blocks: blocks as never, costumes: [{ name: 'c1' }], sounds: [], variables: {}, lists: {} }] })
const say = (text: string) => proj({ a: { opcode: 'event_whenflagclicked', next: 'b', parent: null, inputs: {}, fields: {}, topLevel: true, x: 0, y: 0 }, b: { opcode: 'looks_say', next: null, parent: 'a', inputs: { MESSAGE: [1, [10, text]] }, fields: {}, topLevel: false } })
const random = proj({ a: { opcode: 'event_whenflagclicked', next: 'b', parent: null, inputs: {}, fields: {}, topLevel: true, x: 0, y: 0 }, b: { opcode: 'looks_say', next: null, parent: 'a', inputs: { MESSAGE: [3, 'c', [10, '']] }, fields: {}, topLevel: false }, c: { opcode: 'operator_random', next: null, parent: 'b', inputs: { FROM: [1, [4, '1']], TO: [1, [4, '6']] }, fields: {}, topLevel: false } })

describe('comparaison', () => {
  it('ignore les temps, compare le reste', () => {
    expect(sameTraces(five(trace()), five(trace({ says: [{ sprite: 'Chat', text: 'Bonjour', t: 999 }] })))).toBe(true)
    expect(sameTraces(five(trace()), five(trace({ says: [{ sprite: 'Chat', text: 'Salut', t: 10 }] })))).toBe(false)
  })
  it('résume et décrit les différences', () => {
    expect(summarizeTraces(five(trace({ timedOut: true, finished: false })))).toMatch(/coupé après la durée/)
    expect(differences(five(trace({ says: [] })), five(trace()))).toContain('Paroles différentes de la solution.')
  })
})

describe('tri sans IA', () => {
  const solution = { project: say('Bonjour'), traces: five(trace()) }
  it('identique à la solution, sans hasard ni entrée → validé sans IA', () => {
    const r = triage({ student: { project: say('Bonjour'), traces: five(trace()) }, solution, starter: null, criteriaCount: 2 })
    expect(r).toMatchObject({ kind: 'decided', proposal: { decision: 'validated', source: 'tests' } })
    expect((r as { proposal: { criteria: unknown[] } }).proposal.criteria).toHaveLength(2)
  })
  it('projet sans script, ou identique au départ → non réussi sans IA', () => {
    expect(triage({ student: { project: proj({}), traces: five(trace({ says: [] })) }, solution, starter: null, criteriaCount: 1 }))
      .toMatchObject({ kind: 'decided', proposal: { decision: 'needs_work' } })
    expect(triage({ student: { project: say('X'), traces: five(trace()) }, solution, starter: say('X'), criteriaCount: 1 }))
      .toMatchObject({ kind: 'decided', proposal: { decision: 'needs_work' } })
  })
  it('projet illisible → échec ; aléatoire → IA ; différent → IA', () => {
    expect(triage({ student: { project: null, traces: [trace({ error: 'zip' })] }, solution, starter: null, criteriaCount: 1 }).kind).toBe('failed')
    expect(triage({ student: { project: random, traces: five(trace()) }, solution: { project: random, traces: five(trace()) }, starter: null, criteriaCount: 1 }).kind).toBe('ai')
    expect(triage({ student: { project: say('Salut'), traces: five(trace({ says: [{ sprite: 'Chat', text: 'Salut', t: 1 }] })) }, solution, starter: null, criteriaCount: 1 }).kind).toBe('ai')
  })
})
