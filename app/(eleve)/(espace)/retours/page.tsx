import Link from 'next/link'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listStudentDefis } from '@/lib/db/assignments'
import { recentReviewsForStudent } from '@/lib/db/progress'
import { formatDue } from '@/lib/deadlines/time'
import { ensureClosed } from '@/lib/deadlines/ensure'
import { TeacherInk, TeacherStamp } from '@/components/eleve/TeacherNote'

export const metadata = { title: 'Retours du professeur' }

/** Tous les derniers messages du professeur, chacun sur sa feuille de cahier (onglet « Retours » sur téléphone). */
export default async function RetoursPage() {
  const student = await requireStudent()
  await ensureClosed()
  const db = getDb()
  const items = await listStudentDefis(db, student.id)
  const reviews = await recentReviewsForStudent(db, student.id, items.map((i) => i.activityId), 30)
  const numbers = new Map(items.map((i) => [i.activityId, i.number]))
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px]">Retours du professeur</h1>
        <p className="mt-1 text-muted">Les derniers messages de ton professeur sur tes défis.</p>
      </div>
      {reviews.length === 0 ? (
        <div className="glass p-8 text-center">
          <MessageSquare className="mx-auto size-10 text-primary-soft" aria-hidden />
          <p className="mt-3 text-xl font-semibold">Pas encore de message</p>
          <p className="text-muted">Quand ton professeur aura regardé un défi, son message apparaîtra ici.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={`${r.activityId}-${r.createdAt}`} className="glass seyes marge overflow-hidden py-3 pr-4">
              <p className="flex items-center gap-2 text-[15px] font-semibold leading-8">
                {numbers.has(r.activityId) && <span aria-hidden className="grid size-[26px] place-items-center rounded-full bg-primary-wash text-[13px] text-primary-ink">{numbers.get(r.activityId)}</span>}
                {r.title}
              </p>
              <TeacherStamp decision={r.decision} className="my-1" />
              <TeacherInk>{r.comment}</TeacherInk>
              <div className="flex flex-wrap items-center justify-between gap-2 leading-8">
                <span className="text-[13px] text-muted">{r.teacherName} · {formatDue(r.createdAt)}</span>
                <Link href={`/defis/${r.activityId}`} className="inline-flex items-center text-sm font-semibold text-primary-ink hover:underline">
                  Voir le défi<span className="sr-only"> « {r.title} »</span><ChevronRight className="size-4" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
