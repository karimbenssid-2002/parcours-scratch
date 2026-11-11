'use client'
import { useActionState } from 'react'
import { forceChangeStudentPassword } from '../../actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function ForcedPasswordForm() {
  const [state, action] = useActionState(forceChangeStudentPassword, null)
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Mot de passe provisoire" name="current" type="password" autoComplete="current-password" hint="Celui que ton professeur t'a donné." required />
      <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} hint="8 caractères minimum." required />
      <Field label="Écris-le une deuxième fois" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <SubmitButton className="w-full" pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  )
}
