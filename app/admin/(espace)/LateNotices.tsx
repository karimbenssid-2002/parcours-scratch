import Link from 'next/link'
import { AlarmClockOff } from 'lucide-react'
import type { LateNotice } from '@/lib/deadlines/notices'
import { formatDue } from '@/lib/deadlines/time'
import { markNoticeSeenAction } from './notice-actions'

export function LateNotices({ notices }: { notices: LateNotice[] }) {
  if (notices.length === 0) return null
  return (
    <section aria-labelledby="retards" className="glass p-6 shadow-[inset_0_0_0_2px_var(--color-st-bad-bg),var(--shadow-clay)]">
      <h2 id="retards" className="flex items-center gap-2 text-xl font-semibold text-danger">
        <AlarmClockOff className="size-6" aria-hidden />Travaux non rendus à temps ({notices.length})
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-3 py-2">
            <Link href={n.kind === 'auto_submitted' ? `/admin/revue/${n.progressId}` : `/admin/suivi/eleves/${n.studentId}`} className="flex-1 hover:underline">
              <span className="font-semibold">{n.studentName}</span> — {n.activityTitle}
              <span className="block text-sm text-muted">{n.classNames} · échéance {formatDue(n.dueAt)}</span>
            </Link>
            <span className={`rounded-lg px-2.5 py-0.5 text-sm font-medium ${n.kind === 'auto_submitted' ? 'bg-st-almost-bg text-st-almost' : 'bg-st-bad-bg text-st-bad'}`}>
              {n.kind === 'auto_submitted' ? 'Rendu automatiquement' : 'Non rendu'}
            </span>
            <form action={markNoticeSeenAction.bind(null, n.id)}>
              <button type="submit" className="rounded-lg px-3 py-1 font-semibold text-primary-ink hover:bg-surface" aria-label={`Marquer comme vu : ${n.studentName}, ${n.activityTitle}`}>Vu</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}
