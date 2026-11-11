'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { adminLogin } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function AdminLoginForm() {
  const [state, action] = useActionState(adminLogin, null)
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Identifiant" name="username" autoComplete="username" placeholder="prenom.nom" required />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton className="w-full" pendingLabel="Connexion…">Se connecter</SubmitButton>
      <div className="flex flex-wrap justify-between gap-2 pt-2 text-sm font-semibold">
        <Link className="text-primary-ink underline-offset-4 hover:underline" href="/admin/demande-compte">Demander un compte</Link>
        <Link className="text-primary-ink underline-offset-4 hover:underline" href="/admin/mot-de-passe-oublie">Mot de passe oublié</Link>
      </div>
    </form>
  )
}
