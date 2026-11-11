import { AlarmClock } from 'lucide-react'
import { formatDue, formatRemaining } from '@/lib/deadlines/time'
import type { NextDeadline } from '@/lib/deadlines/next'

export function NextDeadlineCard({ next, nowMs }: { next: NextDeadline; nowMs: number }) {
  return (
    <div className="glass flex items-center gap-3.5 px-5 py-4">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-st-bad-bg text-st-bad">
        <AlarmClock className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-muted">Prochaine échéance</p>
        <p className="text-[26px] font-semibold leading-tight">{formatRemaining(Date.parse(next.dueAt) - nowMs)}</p>
        <p className="truncate text-[13px] text-muted">{next.title} · {formatDue(next.dueAt)}</p>
      </div>
    </div>
  )
}
