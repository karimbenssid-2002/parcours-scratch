'use client'
import { useMemo, useState, useTransition } from 'react'
import { Check, ChevronDown, TriangleAlert } from 'lucide-react'
import { addAssignmentsAction, giveProgressionAction, giveThemesAction } from './assignment-actions'
import { PreviewLink } from './PreviewLink'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { StockItem } from '@/lib/db/assignments'
import type { Theme, ThemeItem, ThemeStep } from '@/lib/db/progressions'
import { progressionCounts, selectionPrerequisite, themePrerequisite } from '@/lib/progressions/rules'
import { STEP_LABELS, stars } from '@/lib/progressions/labels'
import { LEVELS, levelLabel, type Level } from '@/lib/levels'
import { fold } from '@/lib/text'

type Props = {
  classId: string; classLevel: Level; progressions: Record<Level, Theme[]>; stock: StockItem[]; assigned: string[]
}
type Pending = { prerequisite: { number: number; title: string }; run: () => Promise<{ error?: string; success?: string }> }

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const STEPS = Object.keys(STEP_LABELS) as ThemeStep[]

/**
 * « Donner des défis » : la progression du niveau (clé en main : tout le parcours ou un thème entier),
 * ou une sélection cochée dans l'ordre du clic, à travers thèmes, niveaux et stock.
 * Dans la progression du niveau de la classe, un thème qui suppose un thème précédent pas encore donné déclenche une
 * confirmation, jamais un blocage ; piocher dans un autre niveau ne vérifie pas l'ordre des thèmes.
 */
export function ThemePicker({ classId, classLevel, progressions, stock, assigned }: Props) {
  const [level, setLevel] = useState<Level>(classLevel)
  const [open, setOpen] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [result, setResult] = useState<{ error?: string; success?: string }>()
  const [pending, start] = useTransition()
  const given = useMemo(() => new Set(assigned), [assigned])
  const themes = progressions[level]
  const core = themes.filter((t) => !t.optional)
  const optional = themes.filter((t) => t.optional)
  const counts = progressionCounts(themes)
  const shownStock = useMemo(() => {
    const needle = fold(q.trim())
    return stock.filter((s) => !needle || fold(s.title).includes(needle))
  }, [stock, q])

  function run(job: Pending['run'], prerequisite: Pending['prerequisite'] | null, after?: () => void) {
    if (prerequisite) return setConfirm({ prerequisite, run: async () => { const r = await job(); after?.(); return r } })
    start(async () => { setResult(await job()); after?.() })
  }

  function confirmed() {
    const job = confirm
    setConfirm(null)
    if (job) start(async () => setResult(await job.run()))
  }

  const toggle = (id: string, on: boolean) => setPicked((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)))
  const giveSelection = () => {
    const ids = picked
    run(() => addAssignmentsAction(classId, ids), selectionPrerequisite(progressions, classLevel, given, ids), () => setPicked([]))
  }

  function themeCard(t: Theme, number: number | null) {
    const expanded = open.includes(t.id)
    const missing = number ? themePrerequisite(progressions, classLevel, level, given, t.id) : null
    const difficulties = t.items.map((i) => i.difficulty)
    const range = `${stars(Math.min(...difficulties))}${Math.min(...difficulties) !== Math.max(...difficulties) ? ` → ${stars(Math.max(...difficulties))}` : ''}`
    const panelId = `theme-panel-${t.id}`
    return (
      <li key={t.id} className={`rounded-2xl bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)] ${expanded ? 'ring-2 ring-primary-soft' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap sm:p-4">
          <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${number ? 'bg-primary-wash text-primary-ink' : 'bg-tile-muted text-muted'}`}>
            {number ?? '+'}
          </span>
          <button type="button" aria-expanded={expanded} aria-controls={panelId}
            onClick={() => setOpen((cur) => (expanded ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{number && <span className="sr-only">Thème {number} : </span>}{t.title}</span>
              <span className="block text-[13px] text-muted">{plural(t.items.length, 'défi')} · {range}</span>
            </span>
            <ChevronDown className={`size-5 shrink-0 text-muted transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <Button variant="secondary" className="shrink-0 text-sm max-sm:w-full" disabled={pending} aria-label={`Donner tout le thème ${t.title}`}
            onClick={() => run(() => giveThemesAction(classId, [t.id]), missing)}>
            Tout le thème
          </Button>
        </div>
        {missing && (
          <p className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-st-almost-bg px-3 py-1.5 text-[13px] font-medium text-st-almost sm:mx-4">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />À donner de préférence après le thème {missing.number}.
          </p>
        )}
        <div id={panelId} hidden={!expanded} className="space-y-1 border-t border-line px-3 pb-3 pt-2 sm:px-4">
          {t.intro && <p className="pb-1 text-sm text-muted">{t.intro}</p>}
          {STEPS.map((step) => {
            const items = t.items.filter((i) => i.step === step)
            if (items.length === 0) return null
            return (
              <div key={step}>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{STEP_LABELS[step]}</p>
                <ul>{items.map((i) => itemRow(i))}</ul>
              </div>
            )
          })}
        </div>
      </li>
    )
  }

  function itemRow(i: ThemeItem) {
    const already = given.has(i.activityId)
    const rank = picked.indexOf(i.activityId)
    const foreign = i.levels.length > 0 && !i.levels.includes(level)
    return (
      <li key={i.activityId} className="flex items-center gap-1">
        <label className={`flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-1.5 ${already ? 'text-muted' : 'cursor-pointer hover:bg-surface'}`}>
          <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
            <input type="checkbox" disabled={already} checked={already || rank >= 0} onChange={(e) => toggle(i.activityId, e.target.checked)}
              className="peer size-5 cursor-pointer appearance-none rounded-[5px] border-2 border-muted/60 checked:border-primary checked:bg-primary disabled:cursor-default disabled:border-line disabled:bg-tile-muted" />
            {rank >= 0 && <span aria-hidden className="pointer-events-none absolute text-[11px] font-bold text-white">{rank + 1}</span>}
            {already && <Check aria-hidden className="pointer-events-none absolute size-3.5 text-muted" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{i.title}</span>
              <span className="text-sm tracking-wider text-st-almost" aria-label={`Difficulté ${i.difficulty} sur 3`} role="img">{stars(i.difficulty)}</span>
              {foreign && <span className="rounded-md bg-tile-muted px-1.5 py-px text-[11px] text-muted">défi de {i.levels.map(levelLabel).join(' · ')}</span>}
              {already && <span className="text-[13px] text-muted">Déjà donné</span>}
            </span>
            {i.why && <span className="block text-[13px] leading-snug text-muted">{i.why}</span>}
          </span>
        </label>
        <PreviewLink activityId={i.activityId} title={i.title} />
      </li>
    )
  }

  return (
    <section aria-labelledby="donner" className="glass space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id="donner" className="text-xl font-semibold">Donner des défis</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="progression-level" className="text-sm font-semibold">Progression</label>
          <select id="progression-level" value={level} onChange={(e) => setLevel(e.target.value as Level)}
            className="rounded-[10px] border-2 border-line bg-tile px-3 py-1.5">
            {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}{l === classLevel ? ' (niveau de la classe)' : ''}</option>)}
          </select>
        </div>
      </div>

      {counts.defis > 0 ? (
        <Button className="w-full" disabled={pending} onClick={() => run(() => giveProgressionAction(classId, level), null)}>
          Donner tout le parcours {levelLabel(level)} · {plural(counts.themes, 'thème')}, {plural(counts.defis, 'défi')}
        </Button>
      ) : (
        <p className="text-muted">Pas encore de progression pour la {levelLabel(level)} : cherchez vos défis dans le stock ci-dessous.</p>
      )}

      {confirm && (
        <div role="alertdialog" aria-label="Notions pas encore vues" className="flex flex-wrap items-center gap-3 rounded-xl bg-st-almost-bg p-3 text-st-almost">
          <p className="flex-1 font-medium">
            Ce thème suppose le thème {confirm.prerequisite.number} « {confirm.prerequisite.title} », qui n’a pas encore été donné à cette classe. Le donner quand même ?
          </p>
          <Button variant="primary" onClick={confirmed}>Donner quand même</Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Annuler</Button>
        </div>
      )}
      {result?.error && <Alert tone="danger">{result.error}</Alert>}
      {result?.success && <Alert tone="success">{result.success}</Alert>}

      {core.length > 0 && <ol className="space-y-2" aria-label={`Thèmes ${levelLabel(level)}`}>{core.map((t, n) => themeCard(t, n + 1))}</ol>}
      {optional.length > 0 && (
        <div className="space-y-2">
          <h4 className="pt-1 text-sm font-semibold uppercase tracking-wider text-muted">Pour aller plus loin</h4>
          <ul className="space-y-2">{optional.map((t) => themeCard(t, null))}</ul>
        </div>
      )}

      <details className="rounded-2xl bg-tile p-3 sm:p-4">
        <summary className="cursor-pointer font-semibold text-primary-ink">Chercher un défi dans tout le stock</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label htmlFor="stock-q" className="block text-sm font-semibold">Rechercher</label>
            <input id="stock-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-[10px] border-2 border-line bg-tile px-3 py-2" />
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Stock d’activités">
            {shownStock.map((s) => {
              const already = given.has(s.id)
              const rank = picked.indexOf(s.id)
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <label className={`flex flex-1 items-center gap-3 rounded-lg px-2 py-1.5 ${already ? 'text-muted' : 'cursor-pointer hover:bg-surface'}`}>
                    <input type="checkbox" disabled={already} checked={already || rank >= 0} className="accent-primary"
                      onChange={(e) => toggle(s.id, e.target.checked)} />
                    <span className="flex-1">{s.title}</span>
                    <span className="text-sm text-muted">{already ? 'Déjà donné' : rank >= 0 ? `n°${rank + 1} de la sélection` : s.levels.map(levelLabel).join(' · ')}</span>
                  </label>
                  <PreviewLink activityId={s.id} title={s.title} />
                </li>
              )
            })}
            {shownStock.length === 0 && <li className="text-muted">Aucune activité ne correspond.</li>}
          </ul>
        </div>
      </details>

      <div className={`flex flex-wrap items-center gap-3 ${picked.length > 0 ? 'sticky bottom-3 z-10 rounded-xl bg-panel p-3 shadow-[0_4px_16px_rgb(20_27_51/.16)]' : ''}`}>
        <Button disabled={pending || picked.length === 0} onClick={giveSelection}>Donner la sélection ({picked.length})</Button>
        <span className="text-sm text-muted">Les défis s’ajoutent à la fin de la liste de la classe, dans l’ordre où vous les avez cochés.</span>
        {picked.length > 0 && <Button variant="ghost" className="text-sm" onClick={() => setPicked([])}>Tout décocher</Button>}
      </div>
    </section>
  )
}
