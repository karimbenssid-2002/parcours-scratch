import { Clock } from 'lucide-react'
import { formatDue } from '@/lib/deadlines/time'

/** Échéance d'un défi : discrète, orange à moins de 24 h, rouge une fois passée. */
export function DueChip({ dueAt, nowMs }: { dueAt: string; nowMs: number }) {
  const left = Date.parse(dueAt) - nowMs
  const tone = left <= 0 ? 'text-st-bad' : left < 86_400_000 ? 'text-st-almost font-semibold' : 'text-primary-ink'
  return (
    <span className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      <Clock className="size-4 shrink-0" aria-hidden />
      {left <= 0 ? 'Temps écoulé' : `À rendre avant le ${formatDue(dueAt)}`}
    </span>
  )
}
