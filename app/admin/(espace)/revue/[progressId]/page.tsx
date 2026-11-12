import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getReviewView, pendingByClass, queueNeighbors, reviewQueue } from '@/lib/review/service'
import { levelsLabel } from '@/lib/levels'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { StatusBadge } from '@/components/eleve/StatusBadge'
import { YouTubeEmbed } from '@/components/eleve/YouTubeEmbed'
import { ReviewSide } from './ReviewSide'
import { isAutogradeReady, quotaBlock, quotaState } from '@/lib/db/autograde'
import { latestJob, pendingProposals } from '@/lib/autograde/service'
import { isAiConfigured } from '@/lib/autograde/ai'
import { autogradeEnabled } from '@/lib/autograde/enabled'
import { studentDeadline } from '@/lib/db/assignments'
import { formatDue } from '@/lib/deadlines/time'
import { now } from '@/lib/clock'
import { ReviewEditor } from './ReviewEditor'
import { ensureClosed } from '@/lib/deadlines/ensure'

export const metadata = { title: 'Revue d’un défi' }
// Les actions de correction automatique de cette page vident la file après la réponse (after()) : jusqu'à 300 s.
export const maxDuration = 300

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ progressId: string }>; searchParams: Promise<{ classe?: string }> }) {
  const teacher = await requireTeacher()
  await ensureClosed()
  const { progressId } = await params
  const db = getDb()
  const view = await getReviewView(db, teacher.id, progressId)
  if (!view) notFound()
  const { progress, student, activity, history } = view
  // Arrivé depuis la file d'une classe : précédent / suivant restent dans cette classe.
  const { classe } = await searchParams
  const classId = (await pendingByClass(db, teacher.id)).find((c) => c.classId === classe)?.classId
  const queue = await reviewQueue(db, teacher.id, classId)
  const inClass = classId ? `?classe=${classId}` : ''
  const inQueue = queue.some((q) => q.progressId === progressId)
  const { previous, next } = queueNeighbors(queue, progressId)
  const { dueAt } = await studentDeadline(db, student.id, progress.activityId)
  const deadlinePassed = dueAt !== null && now().toISOString() >= dueAt
  const autogradeReady = await isAutogradeReady(db, progress.activityId)
  const job = await latestJob(db, teacher.id, progressId)
  const quotaMessage = autogradeEnabled() ? quotaBlock(await quotaState(db, now()), 1) : null
  const pending = (await pendingProposals(db, [progressId])).get(progressId)
  // Après une correction envoyée automatiquement : défi suivant de la file, sinon retour à la file.
  const nextHref = next ? `/admin/revue/${next}${inClass}` : `/admin/a-valider${inClass}`

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav aria-label="Navigation dans la file" className="flex flex-wrap items-center gap-4">
        <Link href={`/admin/a-valider${inClass}`} className="inline-flex items-center gap-2 font-semibold text-primary-ink hover:underline"><ArrowLeft className="size-4" aria-hidden />Défis à valider</Link>
        {inQueue && (
          <span className="ml-auto flex gap-2">
            {previous && <Link href={`/admin/revue/${previous}${inClass}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-semibold shadow-soft hover:bg-surface"><ChevronLeft className="size-4" aria-hidden />Précédent</Link>}
            {next && <Link href={`/admin/revue/${next}${inClass}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-semibold shadow-soft hover:bg-surface">Suivant<ChevronRight className="size-4" aria-hidden /></Link>}
          </span>
        )}
      </nav>
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="font-semibold text-muted">
            <Link href={`/admin/suivi/eleves/${student.id}`} className="hover:underline">{student.firstName} {student.lastName}</Link> · {levelsLabel(student.levels)}
          </p>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{activity.title}</h1>
        </div>
        <StatusBadge status={progress.status} />
      </header>
      {progress.autoSubmittedAt && (
        <p className="rounded-2xl bg-red-50 p-3 font-semibold text-danger">
          Rendu automatiquement — hors délai (échéance : {formatDue(progress.closedDueAt ?? progress.submittedAt ?? progress.autoSubmittedAt)})
        </p>
      )}

      {/* En dessous de 1536 px, la décision passe sous l'éditeur : la scène Scratch reste entière. */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ReviewEditor progressId={progress.id} />
          {activity.statementYoutubeId && (
            <details className="glass p-4">
              <summary className="cursor-pointer font-semibold">Revoir l'énoncé</summary>
              <div className="mt-3 max-w-2xl"><YouTubeEmbed id={activity.statementYoutubeId} title={`Énoncé du défi ${activity.title}`} /></div>
            </details>
          )}
        </div>
        <aside className="space-y-4">
          {progress.status === 'submitted'
            ? <ReviewSide progressId={progress.id} classId={classId} deadlinePassed={deadlinePassed} autogradeReady={autogradeReady} aiConfigured={isAiConfigured()} autogradeEnabled={autogradeEnabled()} quotaMessage={quotaMessage}
                prepareHref={teacher.role === 'admin' ? `/admin/activites/${progress.activityId}` : null} initialJob={job}
                initialPrefill={pending ? { jobId: pending.jobId, decision: pending.proposal.decision, comment: pending.proposal.comment } : null} nextHref={nextHref} />
            : <p className="glass p-5 text-muted">Ce défi n'est pas en attente de validation : vous pouvez le consulter et le lancer.</p>}
          <section aria-labelledby="historique" className="space-y-2">
            <h2 id="historique" className="text-xl font-semibold">Historique</h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted">Aucune décision pour l'instant.</p>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => (
                  <li key={h.createdAt} className="rounded-xl bg-white p-3 text-sm shadow-soft">
                    <p className="font-semibold">{STATUS_LABELS[h.decision]}</p>
                    <p className="text-muted">{h.teacherName} · {new Date(h.createdAt).toLocaleString('fr-FR')}</p>
                    {h.automatic && <p className="text-xs font-semibold text-primary-ink">Correction automatique{h.verifiedByName ? ` (vérifiée par ${h.verifiedByName})` : ' (non vérifiée)'}</p>}
                    {h.comment && <p className="mt-1 whitespace-pre-line">{h.comment}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
