import type { RunTrace } from './runner/types'
import { projectFeatures, sameProgram, type ProjectJson } from './project-text'
import { sameTraces } from './compare'

export type Proposal = { decision: 'validated' | 'almost' | 'needs_work'; comment: string; criteria: { index: number; met: boolean; reason: string }[]; source: 'tests' | 'ai'; model?: string }
export type Triage = { kind: 'failed'; error: string } | { kind: 'decided'; proposal: Proposal } | { kind: 'ai' }

const all = (n: number, met: boolean, reason: string) => Array.from({ length: n }, (_, i) => ({ index: i + 1, met, reason }))

export function triage(input: { student: { project: ProjectJson | null; traces: RunTrace[] }; solution: { project: ProjectJson; traces: RunTrace[] }; starter: ProjectJson | null; criteriaCount: number }): Triage {
  const { student, solution, starter, criteriaCount } = input
  const error = student.traces.find((t) => t.error)?.error
  if (!student.project || error) return { kind: 'failed', error: `Le projet de l’élève n’a pas pu être exécuté${error ? ` (${error})` : ''}.` }
  const features = projectFeatures(student.project)
  if (features.scriptCount === 0 || (starter && sameProgram(student.project, starter)))
    return { kind: 'decided', proposal: { decision: 'needs_work', comment: 'Ton projet ne contient pas encore de programme.', criteria: all(criteriaCount, false, 'Aucun programme.'), source: 'tests' } }
  const solutionFeatures = projectFeatures(solution.project)
  const deterministic = !features.usesRandom && !features.usesInput && !solutionFeatures.usesRandom && !solutionFeatures.usesInput
  if (deterministic && sameTraces(student.traces, solution.traces))
    return { kind: 'decided', proposal: { decision: 'validated', comment: 'Bravo, ton programme fait exactement ce qui était demandé !', criteria: all(criteriaCount, true, 'Résultat identique à la solution.'), source: 'tests' } }
  return { kind: 'ai' }
}
