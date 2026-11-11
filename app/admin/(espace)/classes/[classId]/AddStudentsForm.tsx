'use client'
import { useActionState } from 'react'
import { addStudentsAction, type AddStudentsState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { SubmitButton } from '@/components/ui/SubmitButton'

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

export function AddStudentsForm({ classId }: { classId: string }) {
  const [state, action] = useActionState<AddStudentsState, FormData>(addStudentsAction.bind(null, classId), null)
  return (
    <form action={action} className="glass space-y-3 p-5">
      <label htmlFor="emails" className="block text-xl font-semibold">Ajouter des élèves</label>
      <p className="text-sm text-muted">Une adresse par ligne (ou séparées par des virgules) : prenom.nom@malraux-rabat.org. Les élèves pas encore inscrits apparaîtront dès leur première connexion.</p>
      <textarea id="emails" name="emails" rows={4} className="w-full rounded-xl border-2 border-line p-3 font-mono text-sm focus:border-primary focus:outline-none"
        placeholder={'prenom.nom@malraux-rabat.org\nautre.eleve@malraux-rabat.org'} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state && !state.error && (
        <Alert tone={state.invalid.length ? 'info' : 'success'}>
          <ul className="space-y-1">
            <li>{plural(state.added.length, 'élève ajouté', 'élèves ajoutés')}</li>
            {state.already.length > 0 && <li>{plural(state.already.length, 'déjà dans la classe', 'déjà dans la classe')}</li>}
            {state.duplicates.length > 0 && <li>{plural(state.duplicates.length, 'doublon ignoré', 'doublons ignorés')}</li>}
            {state.invalid.length > 0 && <li>{plural(state.invalid.length, 'adresse invalide', 'adresses invalides')} : {state.invalid.join(', ')}</li>}
          </ul>
        </Alert>
      )}
      <SubmitButton pendingLabel="Ajout…">Ajouter</SubmitButton>
    </form>
  )
}
