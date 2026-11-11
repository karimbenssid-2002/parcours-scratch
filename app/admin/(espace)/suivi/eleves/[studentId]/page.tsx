import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { studentOverview } from '@/lib/review/service'
import { levelsLabel } from '@/lib/levels'
import { StatusBadge } from '@/components/eleve/StatusBadge'
import { ReopenForm } from './ReopenForm'
import { listStudentDefis } from '@/lib/db/assignments'
import { now } from '@/lib/clock'
import { ensureClosed } from '@/lib/deadlines/ensure'

export const metadata = { title: 'Fiche élève' }

export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const teacher = await requireTeacher()
  await ensureClosed()
  const db = getDb()
  const overview = await studentOverview(db, teacher.id, (await params).studentId)
  if (!overview) notFound()
  const { student, items } = overview
  const nowIso = now().toISOString()
  // Date limite de chaque défi pour cet élève : on peut la repousser, ou rouvrir un défi « Non rendu » / hors délai.
  // Toutes les dates en une fois (et non défi par défi : 2 requêtes par défi commencé).
  const dueOf = new Map((await listStudentDefis(db, student.id)).map((d) => [d.activityId, d.dueAt]))
  const deadlines = new Map<string, string>()
  for (const i of items) {
    const dueAt = dueOf.get(i.activityId)
    if (dueAt && i.status !== 'validated' && i.status !== 'submitted') deadlines.set(i.activityId, dueAt)
  }
  const name = `${student.firstName} ${student.lastName}`
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{name}</h1>
        <p className="text-muted">{student.email} · {levelsLabel(student.levels)}</p>
      </header>
      <section aria-labelledby="travaux" className="space-y-3">
        <h2 id="travaux" className="text-2xl font-semibold">Défis commencés</h2>
        {items.length === 0 ? (
          <p className="glass p-6 text-muted">Cet élève n'a encore commencé aucun défi.</p>
        ) : (
          <ul className="glass divide-y divide-line">
            {items.map((i) => (
              <li key={i.progressId} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/admin/revue/${i.progressId}`} className="flex-1 font-semibold text-primary-ink hover:underline">{i.activityTitle}</Link>
                  <span className="text-sm text-muted">{new Date(i.updatedAt).toLocaleDateString('fr-FR')}</span>
                  <StatusBadge status={i.status} />
                </div>
                {deadlines.has(i.activityId) && (
                  <ReopenForm studentId={student.id} activityId={i.activityId} title={i.activityTitle}
                    dueAt={deadlines.get(i.activityId)!} passed={deadlines.get(i.activityId)! <= nowIso} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
