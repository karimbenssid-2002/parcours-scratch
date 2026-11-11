'use client'
import { useActionState } from 'react'
import { reopenWithDeadlineAction } from './actions'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDue } from '@/lib/deadlines/time'

/** Nouvelle date limite pour cet élève : rouvre un défi dont l'échéance est passée, ou la repousse. */
export function ReopenForm({ studentId, activityId, title, dueAt, passed }: { studentId: string; activityId: string; title: string; dueAt: string; passed: boolean }) {
  const [state, action] = useActionState(reopenWithDeadlineAction.bind(null, studentId, activityId), null)
  const id = `reopen-${activityId}`
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <span className={passed ? 'font-semibold text-danger' : 'text-muted'}>{passed ? 'Échéance passée' : 'À rendre avant le'} {formatDue(dueAt)}.</span>
      <label htmlFor={id} className="font-semibold">{passed ? `Rouvrir « ${title} » jusqu’au` : `Repousser la date limite de « ${title} » au`}</label>
      <input id={id} name="dueAt" type="datetime-local" required className="rounded-lg border-2 border-line bg-white px-2 py-1" />
      <SubmitButton variant="secondary" className="min-h-9 px-3 py-1 text-base" pendingLabel="…">{passed ? 'Rouvrir' : 'Repousser'}</SubmitButton>
      {state?.error && <span role="status" className="font-semibold text-danger">{state.error}</span>}
      {state?.success && <span role="status" className="font-semibold text-cta">{state.success}</span>}
    </form>
  )
}
