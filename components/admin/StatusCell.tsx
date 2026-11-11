import Link from 'next/link'
import { Circle, CircleX, CircleCheck, CircleDot, Pencil, RotateCcw, Send } from 'lucide-react'
import type { ProgressStatus } from '@/lib/db/schema'
import { STATUS_LABELS } from '@/lib/progress/rules'

const look: Record<ProgressStatus, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  not_started: { cls: 'text-line', Icon: Circle },
  in_progress: { cls: 'bg-st-run-bg text-st-run', Icon: Pencil },
  submitted: { cls: 'bg-st-sent text-white', Icon: Send },
  validated: { cls: 'bg-st-ok-bg text-st-ok', Icon: CircleCheck },
  almost: { cls: 'bg-st-almost-bg text-st-almost', Icon: CircleDot },
  needs_work: { cls: 'bg-st-work-bg text-st-work', Icon: RotateCcw },
  not_submitted: { cls: 'text-st-bad shadow-[inset_0_0_0_2px_var(--color-st-bad)]', Icon: CircleX },
}

/** Case de la grille : couleur + icône + libellé accessible (la couleur n'est jamais la seule information). */
export function StatusCell({ status, href }: { status: ProgressStatus; href?: string }) {
  const { cls, Icon } = look[status]
  const content = (
    <span className={`grid size-9 place-items-center rounded-[9px] ${cls}`} title={STATUS_LABELS[status]}>
      <Icon className="size-4" aria-hidden /><span className="sr-only">{STATUS_LABELS[status]}</span>
    </span>
  )
  return href ? <Link href={href} className="inline-block rounded-[9px] transition hover:scale-110">{content}</Link> : content
}
