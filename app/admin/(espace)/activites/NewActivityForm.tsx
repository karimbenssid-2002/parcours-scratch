'use client'
import { useActionState } from 'react'
import { createActivityAction } from './actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function NewActivityForm() {
  const [state, action] = useActionState(createActivityAction, null)
  return (
    <form action={action} className="glass flex flex-wrap items-end gap-3 p-5">
      <h2 className="w-full text-xl font-semibold">Nouvelle activité</h2>
      {state?.error && <div className="w-full"><Alert tone="danger">{state.error}</Alert></div>}
      <div className="min-w-60 flex-1"><Field label="Titre de la nouvelle activité" name="title" maxLength={80} placeholder="Le labyrinthe magique" required /></div>
      <SubmitButton pendingLabel="Création…">Créer</SubmitButton>
    </form>
  )
}
