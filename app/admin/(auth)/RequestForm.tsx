'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { requestTeacherAccess } from './actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function RequestForm({ submitLabel }: { submitLabel: string }) {
  const [state, action] = useActionState(requestTeacherAccess, null)
  if (state?.success)
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.success}</Alert>
        <Link className="font-semibold text-primary-ink hover:underline" href="/admin/login">Retour à la connexion</Link>
      </div>
    )
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Adresse e-mail de l'établissement" name="email" type="email" autoComplete="email"
        placeholder="prenom.nom@malraux-rabat.org" hint="Votre adresse @malraux-rabat.org ou @mlfmonde.org." required />
      <SubmitButton className="w-full" pendingLabel="Envoi…">{submitLabel}</SubmitButton>
      <Link className="block text-center text-sm font-semibold text-primary-ink hover:underline" href="/admin/login">Retour à la connexion</Link>
    </form>
  )
}
