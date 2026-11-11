'use client'
import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Trash2, X } from 'lucide-react'
import {
  addToThemeAction, createThemeAction, deleteThemeAction, removeFromThemeAction, saveThemeItemOrderAction, saveThemeOrderAction,
  updateThemeAction, updateThemeItemAction,
} from './actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { Theme, ThemeItem, ThemeStep } from '@/lib/db/progressions'
import { STEP_LABELS, stars } from '@/lib/progressions/labels'
import { levelLabel, type Level } from '@/lib/levels'
import { fold } from '@/lib/text'

export type StockEntry = { id: string; title: string; status: 'draft' | 'published' }
type Props = { level: Level; themes: Theme[]; stock: StockEntry[] }
type Notify = { announce: (msg: string) => void; fail: (msg?: string) => void }

const STEPS = Object.keys(STEP_LABELS) as ThemeStep[]
const fieldClass = 'rounded-[10px] border-2 border-line bg-tile px-3 py-2 text-base text-ink focus:border-primary focus:outline-none'
const inputClass = `w-full ${fieldClass}`
const sortItems = (items: ThemeItem[]) => [...items].sort((a, b) => STEPS.indexOf(a.step) - STEPS.indexOf(b.step))
const sortThemes = (themes: Theme[]) => [...themes.filter((t) => !t.optional), ...themes.filter((t) => t.optional)]

/** File d'enregistrement : chaque ordre part après le précédent (deux déplacements rapides gardent leur ordre). */
function useSaveQueue() {
  const queue = useRef<Promise<void>>(Promise.resolve())
  return (job: () => Promise<void>) => { queue.current = queue.current.then(job) }
}

/**
 * Progression d'un niveau : thèmes ordonnés (les facultatifs après), et pour chacun ses défis avec étape, étoiles et
 * « Pourquoi ici ». L'état local fait foi pendant la session ; le serveur revérifie chaque ordre.
 */
export function ProgressionEditor({ level, themes: initial, stock }: Props) {
  const [themes, setThemes] = useState(initial)
  const [error, setError] = useState<string>()
  const [announce, setAnnounce] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const enqueue = useSaveQueue()
  const lastMove = useRef(0)
  const buttons = useRef(new Map<string, HTMLButtonElement | null>())
  const notify: Notify = {
    announce: (msg) => { setError(undefined); setAnnounce(msg) },
    fail: (msg) => setError(msg ?? 'L’enregistrement a échoué. Rechargez la page.'),
  }
  const coreIds = themes.filter((t) => !t.optional).map((t) => t.id)

  function moveTheme(from: number, to: number, via?: 'up' | 'down') {
    if (to < 0 || to >= themes.length || from === to || themes[from].optional !== themes[to].optional) return
    const previous = themes
    const next = [...themes]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setThemes(next)
    setAnnounce(`${moved.title} déplacé en position ${to + 1}`)
    if (via) {
      const canGo = (dir: 'up' | 'down') => { const j = dir === 'up' ? to - 1 : to + 1; return j >= 0 && j < next.length && next[j].optional === moved.optional }
      const dir = canGo(via) ? via : via === 'up' ? 'down' : 'up'
      requestAnimationFrame(() => buttons.current.get(`${moved.id}:${dir}`)?.focus())
    }
    const moveId = ++lastMove.current
    enqueue(async () => {
      try {
        const result = await saveThemeOrderAction(level, next.map((t) => t.id))
        if (!result.error) return setError(undefined)
        setError(result.error)
        if (moveId === lastMove.current) setThemes(previous)
      } catch { notify.fail() }
    })
  }

  function create() {
    const title = newTitle.trim()
    if (!title) return setError('Donnez un titre au thème.')
    start(async () => {
      const result = await createThemeAction(level, title)
      if (result.error || !result.id) return setError(result.error)
      const theme: Theme = { id: result.id, level, title, programme: '', intro: '', optional: false, items: [] }
      setThemes((current) => sortThemes([...current, theme]))
      setNewTitle('')
      notify.announce(`Thème ${title} créé`)
    })
  }

  const replace = (theme: Theme) => setThemes((current) => sortThemes(current.map((t) => (t.id === theme.id ? theme : t))))
  const removed = (theme: Theme) => { setThemes((current) => current.filter((t) => t.id !== theme.id)); notify.announce(`Thème ${theme.title} supprimé`) }

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {themes.length === 0 && <p className="glass p-6 text-muted">Aucun thème dans la progression {levelLabel(level)}.</p>}
      <ol className="space-y-4" aria-label={`Thèmes ${levelLabel(level)}`}>
        {themes.map((t, i) => (
          <li key={t.id}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => { if (dragged !== null) moveTheme(dragged, i); setDragged(null) }}
            className={dragged === i ? 'opacity-50' : ''}>
            <ThemeCard theme={t} number={t.optional ? null : coreIds.indexOf(t.id) + 1} stock={stock} notify={notify}
              onChange={replace} onDeleted={removed}
              handle={
                <span className="flex shrink-0 items-center gap-1">
                  <span draggable onDragStart={() => setDragged(i)} onDragEnd={() => setDragged(null)} aria-hidden className="cursor-grab p-1 text-muted">
                    <GripVertical className="size-5" />
                  </span>
                  <Button ref={(el) => { buttons.current.set(`${t.id}:up`, el) }} variant="ghost" className="px-2" aria-label={`Monter le thème ${t.title}`}
                    disabled={i === 0 || themes[i - 1].optional !== t.optional} onClick={() => moveTheme(i, i - 1, 'up')}>
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button ref={(el) => { buttons.current.set(`${t.id}:down`, el) }} variant="ghost" className="px-2" aria-label={`Descendre le thème ${t.title}`}
                    disabled={i === themes.length - 1 || themes[i + 1].optional !== t.optional} onClick={() => moveTheme(i, i + 1, 'down')}>
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                </span>
              } />
          </li>
        ))}
      </ol>
      <form className="glass flex flex-wrap items-end gap-2 p-4" onSubmit={(ev) => { ev.preventDefault(); create() }}>
        <div className="min-w-60 flex-1 space-y-1.5">
          <label htmlFor="new-theme" className="block text-sm font-semibold text-ink">Nouveau thème</label>
          <input id="new-theme" value={newTitle} onChange={(ev) => setNewTitle(ev.target.value)} maxLength={200} className={inputClass}
            placeholder="Par exemple : La variable" />
        </div>
        <Button type="submit" disabled={pending}>Créer le thème</Button>
      </form>
    </div>
  )
}

type CardProps = {
  theme: Theme; number: number | null; stock: StockEntry[]; notify: Notify; handle: React.ReactNode
  onChange: (t: Theme) => void; onDeleted: (t: Theme) => void
}

function ThemeCard({ theme, number, stock, notify, handle, onChange, onDeleted }: CardProps) {
  const [fields, setFields] = useState({ title: theme.title, programme: theme.programme, intro: theme.intro, optional: theme.optional })
  const [confirming, setConfirming] = useState(false)
  const [q, setQ] = useState('')
  const [choice, setChoice] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const enqueue = useSaveQueue()
  const lastMove = useRef(0)
  const buttons = useRef(new Map<string, HTMLButtonElement | null>())
  const dirty = fields.title !== theme.title || fields.programme !== theme.programme || fields.intro !== theme.intro || fields.optional !== theme.optional
  const items = theme.items
  const idBase = `theme-${theme.id}`

  const candidates = useMemo(() => {
    const inTheme = new Set(items.map((i) => i.activityId))
    const needle = fold(q.trim())
    return stock.filter((s) => !inTheme.has(s.id) && (!needle || fold(s.title).includes(needle))).slice(0, 80)
  }, [stock, items, q])

  function saveFields() {
    start(async () => {
      const result = await updateThemeAction(theme.id, fields)
      if (result.error) return notify.fail(result.error)
      onChange({ ...theme, ...fields, title: fields.title.trim() })
      notify.announce(`Thème ${fields.title.trim()} enregistré`)
    })
  }

  function remove() {
    start(async () => {
      const result = await deleteThemeAction(theme.id)
      if (result.error) return notify.fail(result.error)
      onDeleted(theme)
    })
  }

  function add() {
    const activity = stock.find((s) => s.id === (choice || candidates[0]?.id))
    if (!activity) return
    start(async () => {
      const result = await addToThemeAction(theme.id, activity.id)
      if (result.error) return notify.fail(result.error)
      const item: ThemeItem = { activityId: activity.id, title: activity.title, status: activity.status, levels: [], step: 'decouvrir', difficulty: 1, why: '' }
      onChange({ ...theme, items: sortItems([...items, item]) })
      setChoice('')
      notify.announce(`${activity.title} ajouté au thème`)
    })
  }

  function saveItem(item: ThemeItem) {
    onChange({ ...theme, items: sortItems(items.map((i) => (i.activityId === item.activityId ? item : i))) })
    enqueue(async () => {
      try {
        const result = await updateThemeItemAction(theme.id, item.activityId, { step: item.step, difficulty: item.difficulty, why: item.why })
        if (result.error) return notify.fail(result.error)
        notify.announce(`${item.title} enregistré`)
      } catch { notify.fail() }
    })
  }

  function removeItem(item: ThemeItem) {
    start(async () => {
      const result = await removeFromThemeAction(theme.id, item.activityId)
      if (result.error) return notify.fail(result.error)
      onChange({ ...theme, items: items.filter((i) => i.activityId !== item.activityId) })
      notify.announce(`${item.title} retiré du thème`)
    })
  }

  // Un défi ne se déplace qu'à l'intérieur de son étape : l'étape sert d'intertitre, l'ordre affiché suit les étapes.
  function moveItem(from: number, to: number, via?: 'up' | 'down') {
    if (to < 0 || to >= items.length || from === to || items[from].step !== items[to].step) return
    const previous = theme
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ ...theme, items: next })
    notify.announce(`${moved.title} déplacé en position ${to + 1}`)
    if (via) {
      const canGo = (dir: 'up' | 'down') => { const j = dir === 'up' ? to - 1 : to + 1; return j >= 0 && j < next.length && next[j].step === moved.step }
      const dir = canGo(via) ? via : via === 'up' ? 'down' : 'up'
      requestAnimationFrame(() => buttons.current.get(`${moved.activityId}:${dir}`)?.focus())
    }
    const moveId = ++lastMove.current
    enqueue(async () => {
      try {
        const result = await saveThemeItemOrderAction(theme.id, next.map((i) => i.activityId))
        if (!result.error) return
        notify.fail(result.error)
        if (moveId === lastMove.current) onChange(previous)
      } catch { notify.fail() }
    })
  }

  return (
    <section aria-label={`Thème ${theme.title}`} className="glass space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full font-semibold ${number ? 'bg-primary-wash text-primary-ink' : 'bg-tile-muted text-muted'}`} aria-hidden>
          {number ?? '+'}
        </span>
        <h2 className="min-w-0 flex-1 pt-1 text-lg font-semibold leading-snug">
          {number ? <span className="sr-only">Thème {number} : </span> : <span className="mr-2 rounded-full bg-tile-muted px-2 py-0.5 text-xs font-semibold text-muted">Facultatif</span>}
          {theme.title}
        </h2>
        {handle}
      </div>

      <details className="rounded-xl bg-tile p-3">
        <summary className="cursor-pointer font-semibold text-primary-ink">Titre, programme et texte pour le prof</summary>
        <form className="mt-3 space-y-3" onSubmit={(ev) => { ev.preventDefault(); saveFields() }}>
          <div className="space-y-1">
            <label htmlFor={`${idBase}-title`} className="block text-sm font-semibold">Titre du thème</label>
            <input id={`${idBase}-title`} value={fields.title} maxLength={200} className={inputClass}
              onChange={(ev) => setFields({ ...fields, title: ev.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idBase}-prog`} className="block text-sm font-semibold">Référence au programme</label>
            <textarea id={`${idBase}-prog`} value={fields.programme} maxLength={1000} rows={2} className={inputClass}
              onChange={(ev) => setFields({ ...fields, programme: ev.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idBase}-intro`} className="block text-sm font-semibold">Texte pour le prof</label>
            <textarea id={`${idBase}-intro`} value={fields.intro} maxLength={2000} rows={3} className={inputClass}
              onChange={(ev) => setFields({ ...fields, intro: ev.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={fields.optional} onChange={(ev) => setFields({ ...fields, optional: ev.target.checked })} className="size-4 accent-primary" />
            Facultatif (affiché sous « Pour aller plus loin », hors du parcours complet)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !dirty}>Enregistrer le thème</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)} disabled={pending}>
              <Trash2 className="size-4" aria-hidden /> Supprimer le thème
            </Button>
          </div>
          {confirming && (
            <div role="alertdialog" aria-label="Confirmer la suppression" className="space-y-2 rounded-xl bg-st-bad-bg p-3">
              <p>Supprimer le thème « {theme.title} » ? Les défis déjà donnés aux classes ne sont pas touchés.</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={remove} disabled={pending}>Supprimer</Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>Annuler</Button>
              </div>
            </div>
          )}
        </form>
      </details>

      {items.length === 0 ? <p className="text-muted">Aucun défi dans ce thème.</p> : (
        <ol className="space-y-2" aria-label={`Défis du thème ${theme.title}`}>
          {items.map((item, i) => (
            <li key={item.activityId}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => { if (dragged !== null) moveItem(dragged, i); setDragged(null) }}
              className={`space-y-2 rounded-xl bg-panel p-3 shadow-[inset_0_0_0_1.5px_var(--color-line)] ${dragged === i ? 'opacity-50' : ''}`}>
              {(i === 0 || items[i - 1].step !== item.step) && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{STEP_LABELS[item.step]}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span draggable onDragStart={() => setDragged(i)} onDragEnd={() => setDragged(null)} aria-hidden className="cursor-grab text-muted">
                  <GripVertical className="size-5" />
                </span>
                <Link href={`/admin/activites/${item.activityId}`} className="min-w-0 flex-1 truncate font-semibold hover:underline" title={item.title}>{item.title}</Link>
                {item.status === 'draft' && <span className="shrink-0 rounded-full bg-tile-muted px-2.5 py-0.5 text-sm font-semibold text-muted">Brouillon</span>}
                <select aria-label={`Étape de ${item.title}`} value={item.step} className={`${fieldClass} py-1.5`}
                  onChange={(ev) => saveItem({ ...item, step: ev.target.value as ThemeStep })}>
                  {STEPS.map((s) => <option key={s} value={s}>{STEP_LABELS[s]}</option>)}
                </select>
                <select aria-label={`Difficulté de ${item.title}`} value={item.difficulty} className={`${fieldClass} py-1.5`}
                  onChange={(ev) => saveItem({ ...item, difficulty: Number(ev.target.value) as 1 | 2 | 3 })}>
                  {[1, 2, 3].map((d) => <option key={d} value={d}>{stars(d)}</option>)}
                </select>
                <Button ref={(el) => { buttons.current.set(`${item.activityId}:up`, el) }} variant="ghost" className="px-2" aria-label={`Monter ${item.title}`}
                  disabled={i === 0 || items[i - 1].step !== item.step} onClick={() => moveItem(i, i - 1, 'up')}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button ref={(el) => { buttons.current.set(`${item.activityId}:down`, el) }} variant="ghost" className="px-2" aria-label={`Descendre ${item.title}`}
                  disabled={i === items.length - 1 || items[i + 1].step !== item.step} onClick={() => moveItem(i, i + 1, 'down')}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" className="px-2" aria-label={`Retirer ${item.title} du thème`} disabled={pending} onClick={() => removeItem(item)}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              <input aria-label={`Pourquoi ici : ${item.title}`} defaultValue={item.why} maxLength={400} placeholder="Pourquoi ici (phrase affichée aux profs)"
                className={`${inputClass} py-1.5 text-sm`}
                onBlur={(ev) => { if (ev.target.value.trim() !== item.why) saveItem({ ...item, why: ev.target.value.trim() }) }} />
            </li>
          ))}
        </ol>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); add() }}>
        <div className="min-w-48 flex-1 space-y-1">
          <label htmlFor={`${idBase}-q`} className="block text-sm font-semibold">Chercher un défi</label>
          <input id={`${idBase}-q`} type="search" value={q} onChange={(ev) => { setQ(ev.target.value); setChoice('') }} className={inputClass} />
        </div>
        <select aria-label={`Défi à ajouter au thème ${theme.title}`} value={choice || candidates[0]?.id || ''} onChange={(ev) => setChoice(ev.target.value)}
          className={`${fieldClass} min-w-48 flex-1`}>
          {candidates.length === 0 && <option value="">Aucun défi trouvé</option>}
          {candidates.map((s) => <option key={s.id} value={s.id}>{s.status === 'draft' ? `${s.title} (brouillon)` : s.title}</option>)}
        </select>
        <Button type="submit" variant="secondary" disabled={pending || candidates.length === 0}>Ajouter au thème</Button>
      </form>
    </section>
  )
}
