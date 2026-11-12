'use client'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { setEffortAction, setMonthlyCapAction } from './actions'

const EFFORTS = [
  { id: 'low', label: 'Faible (rapide, recommandé)', hint: 'Réponse rapide et économique, suffisante pour la plupart des défis.' },
  { id: 'medium', label: 'Moyen', hint: 'Plus de réflexion avant de répondre : un peu plus lent et plus cher.' },
  { id: 'high', label: 'Élevé', hint: 'Réflexion approfondie pour les programmes difficiles : nettement plus lent et plus cher.' },
] as const

export function EffortForm({ effort }: { effort: string }) {
  const [state, action] = useActionState(setEffortAction, null)
  return (
    <form action={action} className="glass space-y-3 p-6">
      <fieldset className="space-y-2">
        <legend className="text-xl font-semibold">Niveau de réflexion</legend>
        {EFFORTS.map((e) => (
          <label key={e.id} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-surface">
            <input type="radio" name="effort" value={e.id} defaultChecked={effort === e.id} className="mt-1 accent-primary" />
            <span><span className="block font-semibold">{e.label}</span><span className="text-sm text-muted">{e.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  )
}

export function CapForm({ cap }: { cap: number }) {
  const [state, action] = useActionState(setMonthlyCapAction, null)
  return (
    <form action={action} className="glass space-y-3 p-6">
      <h2 className="text-xl font-semibold">Plafond mensuel d’exécutions</h2>
      <p className="text-sm text-muted">
        Nombre maximal d’exécutions de programmes envoyées au service de calcul (Cloud Run) chaque mois, toutes confondues : copies d’élèves, solutions de référence et essais de la page d’une activité.
        Au-delà, les demandes de correction automatique sont refusées jusqu’au mois suivant ; les copies déjà en file se terminent.
      </p>
      <label className="block text-sm font-semibold" htmlFor="cap">Plafond (de 0 à 100 000)</label>
      <input id="cap" name="cap" type="number" inputMode="numeric" min={0} max={100000} step={1} required defaultValue={cap}
        className="w-40 rounded-xl border-2 border-line bg-white px-3 py-2" />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <div><SubmitButton pendingLabel="Enregistrement…">Enregistrer le plafond</SubmitButton></div>
    </form>
  )
}
