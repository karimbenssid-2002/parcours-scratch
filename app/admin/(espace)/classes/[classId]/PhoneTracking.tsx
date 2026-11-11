import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { ProgressStatus } from '@/lib/db/schema'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { StatusCell } from '@/components/admin/StatusCell'

type Activity = { activityId: string; title: string; number: number }
type Row = { name: string; studentId: string; statuses: Record<string, { status: ProgressStatus; progressId: string } | undefined> }

// Ordre d'affichage dans la liste d'un défi : ce qui demande une action d'abord.
const ORDER: ProgressStatus[] = ['submitted', 'almost', 'needs_work', 'in_progress', 'not_submitted', 'not_started', 'validated']

/** Suivi d'une classe sur téléphone (la grille élèves × défis ne tient pas) :
 *  par défi (répartition des statuts), par élève (ses statuts), ou les élèves d'un défi. */
export function PhoneTracking({ classId, activities, rows, view, defiId }: {
  classId: string; activities: Activity[]; rows: Row[]; view: 'defis' | 'eleves'; defiId: string | null
}) {
  const base = `/admin/classes/${classId}`
  const status = (r: Row, a: string): ProgressStatus => r.statuses[a]?.status ?? 'not_started'
  const defi = defiId ? activities.find((a) => a.activityId === defiId) : undefined

  if (defi) {
    const sorted = [...rows].sort((x, y) => ORDER.indexOf(status(x, defi.activityId)) - ORDER.indexOf(status(y, defi.activityId)))
    return (
      <div className="space-y-3 md:hidden">
        <Link href={base} className="inline-flex items-center gap-2 font-semibold text-primary-ink"><ArrowLeft className="size-4" aria-hidden />Tous les défis</Link>
        <h3 className="text-xl font-semibold">n°{defi.number} · {defi.title}</h3>
        <ul className="glass overflow-hidden">
          {sorted.map((r) => {
            const cell = r.statuses[defi.activityId]
            const inner = (
              <>
                <StatusCell status={status(r, defi.activityId)} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span><span className="block text-sm text-muted">{STATUS_LABELS[status(r, defi.activityId)]}</span></span>
                {cell && <ChevronRight className="size-[18px] text-muted" aria-hidden />}
              </>
            )
            return (
              <li key={r.studentId} className="border-b border-line last:border-b-0">
                {cell ? <Link href={`/admin/revue/${cell.progressId}`} className="flex items-center gap-3 px-4 py-2.5">{inner}</Link>
                  : <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const tabs = (
    <nav aria-label="Vue du suivi" className="flex rounded-xl bg-tile-muted p-1">
      {(['defis', 'eleves'] as const).map((v) => (
        <Link key={v} href={v === 'defis' ? base : `${base}?vue=eleves`} aria-current={view === v ? 'page' : undefined}
          className={`flex-1 rounded-[9px] py-2 text-center text-sm ${view === v ? 'bg-panel font-semibold shadow-[0_1px_3px_rgb(20_27_51/.12)]' : 'font-medium text-muted'}`}>
          {v === 'defis' ? 'Par défi' : 'Par élève'}
        </Link>
      ))}
    </nav>
  )

  if (view === 'eleves') {
    return (
      <div className="space-y-3 md:hidden">
        {tabs}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.studentId} className="glass p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <Link href={`/admin/suivi/eleves/${r.studentId}`} className="truncate font-semibold hover:underline">{r.name}</Link>
                <span className="shrink-0 text-sm"><b className="font-semibold">{activities.filter((a) => status(r, a.activityId) === 'validated').length}</b><span className="text-muted">/{activities.length} validés</span></span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activities.map((a) => {
                  const cell = r.statuses[a.activityId]
                  return <StatusCell key={a.activityId} status={cell?.status ?? 'not_started'} href={cell ? `/admin/revue/${cell.progressId}` : undefined} />
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const total = rows.length || 1
  return (
    <div className="space-y-3 md:hidden">
      {tabs}
      <ul className="glass overflow-hidden">
        {activities.map((a) => {
          const n = (s: ProgressStatus) => rows.filter((r) => status(r, a.activityId) === s).length
          const [v, e, p] = [n('validated'), n('submitted'), n('almost') + n('needs_work')]
          return (
            <li key={a.activityId} className="border-b border-line last:border-b-0">
              <Link href={`${base}?defi=${a.activityId}`} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-wash font-semibold text-primary-ink">{a.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.title}</span>
                  <span aria-hidden className="my-2 flex h-2.5 overflow-hidden rounded-full bg-line">
                    <i className="bg-st-ok" style={{ width: `${(v / total) * 100}%` }} /><i className="bg-st-sent" style={{ width: `${(e / total) * 100}%` }} /><i className="bg-[#e59a12]" style={{ width: `${(p / total) * 100}%` }} />
                  </span>
                  <span className="block text-[13px] text-muted">
                    <b className="font-semibold text-st-ok">{v}</b> validé{v > 1 ? 's' : ''} · <b className="font-semibold text-st-sent">{e}</b> à valider · <b className="font-semibold text-st-almost">{p}</b> à corriger
                  </span>
                </span>
                <ChevronRight className="mt-1.5 size-[18px] shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
