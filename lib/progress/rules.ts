import type { ProgressStatus, ReviewDecision } from '@/lib/db/schema'

export const EDITABLE_STATUSES = ['not_started', 'in_progress', 'almost', 'needs_work'] as const satisfies readonly ProgressStatus[]
export const SUBMITTABLE_STATUSES = ['in_progress', 'almost', 'needs_work'] as const satisfies readonly ProgressStatus[]

export const canEdit = (s: ProgressStatus) => (EDITABLE_STATUSES as readonly ProgressStatus[]).includes(s)
export const canSubmit = (s: ProgressStatus) => (SUBMITTABLE_STATUSES as readonly ProgressStatus[]).includes(s)

export const STATUS_LABELS: Record<ProgressStatus, string> = {
  not_started: 'Pas commencé',
  in_progress: 'En cours',
  submitted: 'Envoyé au professeur',
  validated: 'Défi validé',
  almost: 'Défi presque réussi',
  needs_work: 'Défi non réussi',
  not_submitted: 'Non rendu',
}

/** Ce que l'élève doit faire après la décision de son professeur. */
export const DECISION_NEXT_STEP: Record<ReviewDecision, string> = {
  validated: 'Bravo, ton défi est réussi ! Il est terminé.',
  almost: 'C’est bien, tu y es presque ! Il reste quelques points à corriger : lis le message de ton professeur, corrige ton projet, puis renvoie-le.',
  needs_work: 'Ton défi n’est pas réussi. Lis le message de ton professeur et corrige ton projet, ou recommence-le depuis le début si besoin, puis renvoie-le.',
}
