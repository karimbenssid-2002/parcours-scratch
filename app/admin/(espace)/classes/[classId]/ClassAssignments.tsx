'use client'
import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, X } from 'lucide-react'
import { removeAssignmentAction, saveAssignmentOrderAction, setAssignmentDueAction, toggleSolutionAction } from './assignment-actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PreviewLink } from './PreviewLink'
import type { Assignment } from '@/lib/db/assignments'
import { formatDue, parseSchoolDateTime, toSchoolInput } from '@/lib/deadlines/time'

export function ClassAssignments({ classId, assignments, isAdmin }: { classId: string; assignments: Assignment[]; isAdmin: boolean }) {
  const [items, setItems] = useState(assignments)
  const [error, setError] = useState<string>()
  const [announce, setAnnounce] = useState('')
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState<string | null>(null) // défi dont le retrait attend confirmation
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const lastMove = useRef(0)
  const buttons = useRef(new Map<string, HTMLButtonElement | null>())

  function move(from: number, to: number, via: 'up' | 'down') {
    if (to < 0 || to >= items.length) return
    const previous = items
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    setAnnounce(`${moved.title} déplacé en position ${to + 1}`)
    const atEdge = (via === 'up' && to === 0) || (via === 'down' && to === next.length - 1)
    const direction = atEdge ? (via === 'up' ? 'down' : 'up') : via
    requestAnimationFrame(() => buttons.current.get(`${moved.activityId}:${direction}`)?.focus())
    const moveId = ++lastMove.current
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await saveAssignmentOrderAction(classId, next.map((e) => e.activityId)).catch(() => ({ error: 'L’enregistrement a échoué. Rechargez la page.' }))
      setError(result.error)
      if (result.error && moveId === lastMove.current) setItems(previous)
    })
  }

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {items.length === 0 ? (
        <p className="glass p-6 text-muted">Aucun défi donné à cette classe : vos élèves ne voient rien pour l’instant.</p>
      ) : (
        <ol className="space-y-2" aria-label="Défis de la classe">
          {items.map((a, i) => (
            <li key={a.activityId} className="glass space-y-2 p-3">
              {/* Sur téléphone, le titre prend toute la ligne et les actions passent dessous. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-center text-lg font-semibold">{i + 1}</span>
                {/* L'enseignant n'a pas accès à la fiche de l'activité : son titre mène à l'aperçu élève. */}
                {isAdmin || a.status === 'published'
                  ? <Link href={isAdmin ? `/admin/activites/${a.activityId}` : `/admin/apercu/${a.activityId}`} className="min-w-0 flex-1 basis-[calc(100%-3rem)] truncate font-semibold hover:underline md:basis-auto" title={a.title}>{a.title}</Link>
                  : <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] truncate font-semibold md:basis-auto" title={a.title}>{a.title}</span>}
                {a.status === 'draft' && <span className="shrink-0 rounded-lg bg-st-idle-bg px-2.5 py-0.5 text-sm font-semibold text-st-idle">Masqué (brouillon)</span>}
                {(isAdmin || a.status === 'published') && <PreviewLink activityId={a.activityId} title={a.title} />}
                <Button ref={(el) => { buttons.current.set(`${a.activityId}:up`, el) }} variant="ghost" className="shrink-0 px-2" aria-label={`Monter ${a.title}`} disabled={i === 0} onClick={() => move(i, i - 1, 'up')}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button ref={(el) => { buttons.current.set(`${a.activityId}:down`, el) }} variant="ghost" className="shrink-0 px-2" aria-label={`Descendre ${a.title}`} disabled={i === items.length - 1} onClick={() => move(i, i + 1, 'down')}><ArrowDown className="size-4" aria-hidden /></Button>
                <Button variant="secondary" className="min-h-9 shrink-0 px-3 py-1 text-sm" disabled={pending || !a.hasSolution}
                  title={a.hasSolution ? undefined : 'Aucune solution de référence pour ce défi'}
                  aria-label={`${a.solutionShared ? 'Ne plus partager' : 'Partager'} le corrigé de ${a.title}`}
                  onClick={() => start(async () => {
                    const r = await toggleSolutionAction(classId, a.activityId, !a.solutionShared)
                    if (r.error) return setError(r.error)
                    setItems((cur) => cur.map((x) => (x.activityId === a.activityId ? { ...x, solutionShared: !a.solutionShared } : x)))
                    setAnnounce(r.success ?? '')
                  })}>
                  {a.solutionShared ? 'Ne plus partager le corrigé' : 'Partager le corrigé'}
                </Button>
                <Button variant="ghost" className="shrink-0 px-2" aria-label={`Retirer ${a.title} de la classe`} disabled={pending}
                  aria-expanded={confirming === a.activityId} onClick={() => setConfirming(a.activityId)}><X className="size-4" aria-hidden /></Button>
              </div>
              {confirming === a.activityId && (
                <div role="alertdialog" aria-label="Confirmer le retrait" className="flex flex-wrap items-center gap-2 rounded-xl bg-st-bad-bg p-3 md:ml-10">
                  <p className="flex-1 text-sm font-semibold text-st-bad">
                    Retirer « {a.title} » de la classe ? Vos élèves ne le verront plus ; leur travail est conservé.
                  </p>
                  <Button variant="danger" className="min-h-9 px-3 py-1 text-sm" disabled={pending}
                    onClick={() => start(async () => {
                      const r = await removeAssignmentAction(classId, a.activityId)
                      setConfirming(null)
                      if (r.error) return setError(r.error)
                      setItems((cur) => cur.filter((x) => x.activityId !== a.activityId))
                      setAnnounce(`${a.title} retiré de la classe`)
                    })}>Retirer</Button>
                  <Button variant="secondary" className="min-h-9 px-3 py-1 text-sm" autoFocus onClick={() => setConfirming(null)}>Annuler</Button>
                </div>
              )}
              <DueEditor classId={classId} assignment={a} onSaved={(dueAt) => setItems((cur) => cur.map((x) => (x.activityId === a.activityId ? { ...x, dueAt } : x)))} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Date limite d'un défi : repliée derrière « Ajouter une date limite » (ou « Modifier la date ») tant qu'on ne l'édite pas. */
function DueEditor({ classId, assignment, onSaved }: { classId: string; assignment: Assignment; onSaved: (dueAt: string | null) => void }) {
  const [value, setValue] = useState(assignment.dueAt ? toSchoolInput(assignment.dueAt) : '')
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>()
  const [pending, start] = useTransition()
  const id = `due-${assignment.activityId}`
  const submit = (raw: string) => start(async () => {
    const r = await setAssignmentDueAction(classId, assignment.activityId, raw)
    if (r.error) return setMessage({ tone: 'error', text: r.error })
    setMessage({ tone: 'ok', text: r.success ?? '' })
    if (raw === '') setValue('')
    setOpen(false)
    onSaved(raw === '' ? null : parseSchoolDateTime(raw))
  })
  const status = message && <span role="status" className={message.tone === 'error' ? 'font-semibold text-st-bad' : 'font-semibold text-st-ok'}>{message.text}</span>

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm md:pl-10">
        {assignment.dueAt && <span className="text-muted">À rendre avant le {formatDue(assignment.dueAt)} (heure du Maroc)</span>}
        <Button variant="ghost" className="min-h-9 px-3 py-1 text-base" onClick={() => { setMessage(undefined); setOpen(true) }}>
          {assignment.dueAt ? <><Pencil className="size-4" aria-hidden />Modifier la date</> : <><Plus className="size-4" aria-hidden />Ajouter une date limite</>}
        </Button>
        {status}
      </div>
    )
  }
  return (
    <form className="flex flex-wrap items-center gap-2 text-sm md:pl-10" onSubmit={(e) => { e.preventDefault(); submit(value) }}>
      <label htmlFor={id} className="basis-full font-semibold md:basis-auto">Date limite de « {assignment.title} »</label>
      <input id={id} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
        className="min-w-0 flex-1 rounded-lg border-2 border-line bg-white px-2 py-1.5 md:flex-none" />
      <Button type="submit" variant="secondary" className="min-h-9 px-3 py-1 text-base" disabled={pending}>Enregistrer</Button>
      {assignment.dueAt && <Button variant="ghost" className="min-h-9 px-3 py-1 text-base" disabled={pending} onClick={() => submit('')}>Supprimer la date</Button>}
      <Button variant="ghost" className="min-h-9 px-3 py-1 text-base" disabled={pending}
        onClick={() => { setValue(assignment.dueAt ? toSchoolInput(assignment.dueAt) : ''); setMessage(undefined); setOpen(false) }}>Annuler</Button>
      {status}
    </form>
  )
}
