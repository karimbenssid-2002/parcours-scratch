'use client'
import { startTransition, useActionState, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { saveActivityAction, type ActivityFormState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { LEVELS, levelLabel, type Level } from '@/lib/levels'

type HelpRow = { key: number; title: string; url: string }
type Props = {
  activityId: string
  title: string
  instructions: string | null
  statementYoutubeId: string | null
  status: 'draft' | 'published'
  levels: Level[]
  helpVideos: { title: string; youtubeId: string }[]
}

const MAX_HELP = 12
let nextKey = 1

export function ActivityForm(props: Props) {
  const [state, action, saving] = useActionState<ActivityFormState, FormData>(saveActivityAction.bind(null, props.activityId), null)
  // Champs contrôlés : React 19 réinitialise les champs non contrôlés après chaque action, même en cas d'erreur.
  const [title, setTitle] = useState(props.title)
  const [instructions, setInstructions] = useState(props.instructions ?? '')
  const [statement, setStatement] = useState(props.statementYoutubeId ? `https://youtu.be/${props.statementYoutubeId}` : '')
  const [levels, setLevels] = useState<Level[]>(props.levels)
  const [status, setStatus] = useState(props.status)
  const [help, setHelp] = useState<HelpRow[]>(() =>
    props.helpVideos.map((v) => ({ key: nextKey++, title: v.title, url: `https://youtu.be/${v.youtubeId}` })))

  const move = (index: number, delta: number) => setHelp((rows) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return rows
    const copy = [...rows]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    return copy
  })
  const update = (key: number, patch: Partial<HelpRow>) => setHelp((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    // onSubmit plutôt que action={…} : React 19 appelle form.reset() après une action, ce qui décoche
    // les cases (même contrôlées) et ferait perdre la saisie en cas d'erreur de validation.
    <form className="glass space-y-6 p-6"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}>
      <Field label="Titre" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      <div className="space-y-1.5">
        <label htmlFor="instructions" className="block font-semibold">Consigne</label>
        <textarea id="instructions" name="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={2000}
          className="w-full rounded-xl border-2 border-line p-3 focus:border-primary focus:outline-none" />
      </div>
      <Field label="Vidéo d'énoncé (adresse YouTube)" name="statement"
        value={statement} onChange={(e) => setStatement(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=…" hint="Toutes les formes d’adresse YouTube sont acceptées." />

      <fieldset className="space-y-3">
        <legend className="font-semibold">Vidéos d'aide</legend>
        {help.length === 0 && <p className="text-sm text-muted">Aucune vidéo d'aide.</p>}
        <ol className="space-y-3">
          {help.map((row, i) => (
            <li key={row.key} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <label htmlFor={`help-title-${row.key}`} className="text-sm font-semibold">{`Titre de la vidéo d'aide n°${i + 1}`}</label>
                <input id={`help-title-${row.key}`} name="helpTitle" value={row.title} maxLength={120} onChange={(e) => update(row.key, { title: e.target.value })}
                  className="w-full rounded-lg border-2 border-line bg-white px-3 py-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor={`help-url-${row.key}`} className="text-sm font-semibold">{`Adresse de la vidéo d'aide n°${i + 1}`}</label>
                <input id={`help-url-${row.key}`} name="helpUrl" value={row.url} onChange={(e) => update(row.key, { url: e.target.value })}
                  className="w-full rounded-lg border-2 border-line bg-white px-3 py-2" />
              </div>
              <div className="flex items-end gap-1">
                <Button variant="ghost" className="px-2" aria-label={`Monter la vidéo d'aide n°${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="px-2" aria-label={`Descendre la vidéo d'aide n°${i + 1}`} disabled={i === help.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="px-2" aria-label={`Supprimer la vidéo d'aide n°${i + 1}`} onClick={() => setHelp((rows) => rows.filter((r) => r.key !== row.key))}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" className="text-base" disabled={help.length >= MAX_HELP}
          onClick={() => setHelp((rows) => [...rows, { key: nextKey++, title: '', url: '' }])}>
          <Plus className="size-4" aria-hidden />Ajouter une vidéo d'aide
        </Button>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">Niveaux</legend>
        <div className="flex flex-wrap gap-3">
          {LEVELS.map((l) => (
            <label key={l} className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-4 py-2 has-[:checked]:border-primary has-[:checked]:bg-surface">
              <input type="checkbox" name="levels" value={l} checked={levels.includes(l)} className="accent-primary"
                onChange={(e) => setLevels((current) => (e.target.checked ? [...current, l] : current.filter((x) => x !== l)))} />{levelLabel(l)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">Statut</legend>
        <div className="flex flex-wrap gap-3">
          {(['draft', 'published'] as const).map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-4 py-2 has-[:checked]:border-primary has-[:checked]:bg-surface">
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="accent-primary" />{s === 'draft' ? 'Brouillon' : 'Publiée'}
            </label>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted">Une activité en brouillon n’est jamais visible des élèves.</p>
      </fieldset>

      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </form>
  )
}
