import type { RecentReview } from '@/lib/db/progress'
import { formatDue } from '@/lib/deadlines/time'
import { TeacherInk, TeacherStamp } from './TeacherNote'

/** Derniers commentaires du professeur, écrits à la main dans la marge du cahier.
 *  Volontairement sans lien : les lignes de la liste restent les seuls liens portant le titre d'un défi. */
export function FeedbackPanel({ reviews, numbers }: { reviews: RecentReview[]; numbers: Map<string, number> }) {
  return (
    <section aria-labelledby="retours" className="glass seyes marge self-start overflow-hidden py-5 pr-5">
      <h2 id="retours" className="mb-3 text-[22px] font-semibold leading-8">Retours du professeur</h2>
      <ul className="space-y-6">
        {reviews.map((r) => (
          <li key={`${r.activityId}-${r.createdAt}`}>
            <p className="flex items-center gap-2 text-sm font-semibold leading-8">
              {numbers.has(r.activityId) && (
                <span aria-hidden className="grid size-[26px] place-items-center rounded-full bg-primary-wash text-[13px] text-primary-ink">{numbers.get(r.activityId)}</span>
              )}
              {r.title}
            </p>
            <TeacherStamp decision={r.decision} className="my-1.5" />
            <TeacherInk>{r.comment}</TeacherInk>
            <p className="text-[13px] leading-8 text-muted">{r.teacherName} · {formatDue(r.createdAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
