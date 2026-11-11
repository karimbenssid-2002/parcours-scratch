import { Circle, CircleCheck, CircleDot, CircleX, Pencil, RotateCcw, Send } from 'lucide-react'
import type { ProgressStatus } from '@/lib/db/schema'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { statusTone } from '@/lib/ui/scratch-colors'

const icons: Record<ProgressStatus, React.ComponentType<{ className?: string }>> = {
  not_started: Circle, in_progress: Pencil, submitted: Send, validated: CircleCheck,
  almost: CircleDot, needs_work: RotateCcw, not_submitted: CircleX,
}

export function StatusBadge({ status }: { status: ProgressStatus }) {
  const Icon = icons[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-medium ${statusTone[status]}`}>
      <Icon className="size-3.5" aria-hidden />{STATUS_LABELS[status]}
    </span>
  )
}
