'use client'
import { useActionState } from 'react'
import { changeAdminPassword } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function ChangePasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const [state, action] = useActionState(changeAdminPassword, null)
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {requireCurrent && <Field label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" required />}
      <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} hint="8 caractères minimum." required />
      <Field label="Confirmation" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <SubmitButton className="w-full" pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  )
}
