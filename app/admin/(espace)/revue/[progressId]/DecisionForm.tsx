'use client'
import { useActionState, useState, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { decideAction } from './actions'
import { Alert } from '@/components/ui/Alert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { STATUS_LABELS } from '@/lib/progress/rules'

const OPTIONS = [
  { value: 'validated', hint: 'Le défi est réussi : il est terminé, l’élève ne peut plus le modifier.' },
  { value: 'almost', hint: 'C’est bien, mais il reste des points à corriger : l’élève corrige son projet puis le renvoie.' },
  { value: 'needs_work', hint: 'Le défi est raté : l’élève doit corriger son projet, voire le refaire entièrement.' },
] as const

export type Prefill = { jobId: string; decision: (typeof OPTIONS)[number]['value']; comment: string }

type Props = {
  progressId: string
  classId?: string
  deadlinePassed: boolean
  prefill?: Prefill | null
  /** Boutons de correction automatique, au-dessus de « Votre décision ». */
  headerAction?: ReactNode
  /** Suivi et résultat de la correction automatique, sous le titre. */
  notice?: ReactNode
}

export function DecisionForm({ progressId, classId, deadlinePassed, prefill, headerAction, notice }: Props) {
  const [state, action] = useActionState(decideAction.bind(null, progressId, classId ?? null), null)
  const [decision, setDecision] = useState<(typeof OPTIONS)[number]['value'] | null>(prefill?.decision ?? null)
  const commentRequired = decision !== null && decision !== 'validated'
  return (
    <form action={action} className="glass space-y-4 p-5">
      {headerAction && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-semibold"><Bot className="size-[18px] text-primary-ink" aria-hidden />Correction automatique</p>
          {headerAction}
          {notice}
        </div>
      )}
      {!headerAction && notice}
      <h2 className="text-xl font-semibold">Votre décision</h2>
      <fieldset className="space-y-2">
        <legend className="sr-only">Votre décision</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition ${decision === o.value ? 'border-primary bg-primary-wash' : 'border-line hover:border-primary-soft'}`}>
            <input type="radio" name="decision" value={o.value} required className="mt-1 accent-primary" defaultChecked={prefill?.decision === o.value} onChange={() => setDecision(o.value)} />
            <span><span className="block font-semibold">{STATUS_LABELS[o.value]}</span><span className="text-sm text-muted">{o.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {deadlinePassed && (decision === 'almost' || decision === 'needs_work') && (
        <div className="space-y-1.5 rounded-xl bg-surface p-3">
          <label htmlFor="extendTo" className="block font-semibold">Accorder un délai : nouvelle date et heure limite (facultatif)</label>
          <input id="extendTo" name="extendTo" type="datetime-local" className="rounded-lg border-2 border-line bg-white px-2 py-1.5" />
          <p className="text-sm text-muted">Sans délai, l’élève pourra continuer à travailler mais plus envoyer son défi.</p>
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="comment" className="block font-semibold">Commentaire pour l’élève{commentRequired ? ' (obligatoire)' : ' (facultatif)'}</label>
        {/* Saisi directement « à la main » sur le cahier, comme l'élève le verra ; toute la largeur, sans marge. */}
        <textarea id="comment" name="comment" rows={5} maxLength={2000} required={commentRequired} defaultValue={prefill?.comment ?? ''}
          className="seyes encre w-full resize-y rounded-xl px-3 py-1 shadow-[inset_0_0_0_1.5px_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-primary)] focus:outline-none" />
      </div>
      {prefill && <input type="hidden" name="autogradeJobId" value={prefill.jobId} />}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton variant="cta" className="w-full" pendingLabel="Enregistrement…">Enregistrer la décision</SubmitButton>
    </form>
  )
}
