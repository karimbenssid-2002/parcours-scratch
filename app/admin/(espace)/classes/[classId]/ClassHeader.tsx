'use client'
import { useActionState, useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteClassAction, updateClassAction, type ClassFormState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { LEVELS, levelLabel, type Level } from '@/lib/levels'
import { levelTone } from '@/lib/ui/scratch-colors'

export function ClassHeader({ classId, name, level }: { classId: string; name: string; level: Level }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()
  const [state, action] = useActionState(async (prev: ClassFormState, formData: FormData) => {
    const result = await updateClassAction(classId, prev, formData)
    if (!result?.error) setEditing(false)
    return result
  }, null)

  if (editing)
    return (
      <form action={action} className="glass flex flex-wrap items-end gap-3 p-5">
        {state?.error && <div className="w-full"><Alert tone="danger">{state.error}</Alert></div>}
        <div className="min-w-48 flex-1"><Field label="Nom de la classe" name="name" defaultValue={name} maxLength={40} required /></div>
        <div className="space-y-1.5">
          <label htmlFor="edit-level" className="block font-semibold">Niveau</label>
          <select id="edit-level" name="level" defaultValue={level} className="rounded-[10px] border-2 border-line bg-panel px-4 py-2.5">
            {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
          </select>
        </div>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        <Button variant="secondary" onClick={() => setEditing(false)}>Annuler</Button>
      </form>
    )

  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{name}</h1>
          <span aria-hidden className={`rounded-md px-2 py-0.5 text-sm font-semibold ${levelTone(level)}`}>{levelLabel(level)}</span>
        </div>
        <p className="text-muted">Niveau {levelLabel(level)} · dates limites à l’heure du Maroc</p>
      </div>
      <Button variant="secondary" className="text-base" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden />Modifier</Button>
      {confirmDelete ? (
        <div role="alertdialog" aria-label="Confirmer la suppression" className="flex items-center gap-2 rounded-xl bg-st-bad-bg p-2">
          <span className="text-sm font-semibold text-st-bad">Supprimer la classe ? Le travail des élèves est conservé.</span>
          <Button variant="danger" className="text-base" disabled={pending} onClick={() => start(() => deleteClassAction(classId))}>Supprimer</Button>
          <Button variant="ghost" className="text-base" onClick={() => setConfirmDelete(false)}>Annuler</Button>
        </div>
      ) : (
        <Button variant="ghost" className="text-base" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden />Supprimer</Button>
      )}
    </header>
  )
}
