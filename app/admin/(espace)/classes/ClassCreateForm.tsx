'use client'
import { useActionState } from 'react'
import { createClassAction } from './actions'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { LEVELS, levelLabel } from '@/lib/levels'

export function ClassCreateForm() {
  const [state, action] = useActionState(createClassAction, null)
  return (
    <form action={action} className="glass flex flex-wrap items-end gap-3 p-5">
      {state?.error && <div className="w-full"><Alert tone="danger">{state.error}</Alert></div>}
      <div className="min-w-48 flex-1"><Field label="Nom de la classe" name="name" placeholder="6e B" maxLength={40} required /></div>
      <div className="space-y-1.5">
        <label htmlFor="level" className="block font-semibold">Niveau</label>
        <select id="level" name="level" defaultValue="6" className="rounded-xl border-2 border-line bg-white px-4 py-3">
          {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
        </select>
      </div>
      <SubmitButton pendingLabel="Création…">Créer la classe</SubmitButton>
    </form>
  )
}
