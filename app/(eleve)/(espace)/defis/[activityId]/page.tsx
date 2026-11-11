import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpenCheck } from 'lucide-react'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { latestReview } from '@/lib/db/progress'
import { DEADLINE_PASSED, openActivityFor } from '@/lib/projects/service'
import { now } from '@/lib/clock'
import { canEdit, canSubmit, DECISION_NEXT_STEP, STATUS_LABELS } from '@/lib/progress/rules'
import { DeadlineBanner } from '@/components/eleve/DeadlineBanner'
import { canSeeSolution } from '@/lib/autograde/corrige'
import { StatusBadge } from '@/components/eleve/StatusBadge'
import { DefiBrief } from '@/components/eleve/DefiBrief'
import { TeacherInk, TeacherStamp } from '@/components/eleve/TeacherNote'
import { formatDue } from '@/lib/deadlines/time'
import { DefiWorkspace } from './DefiWorkspace'
import { ensureClosed } from '@/lib/deadlines/ensure'

export const metadata = { title: 'Défi' }

export default async function DefiPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params
  const student = await requireStudent()
  await ensureClosed()
  const db = getDb()
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) notFound()
  const { detail, progress, dueAt, number } = opened
  const status = progress?.status ?? 'not_started'
  const review = progress ? await latestReview(db, progress.id) : null
  const nowIso = now().toISOString()
  const solutionShared = await canSeeSolution(db, { studentId: student.id }, activityId)
  const passed = dueAt !== null && nowIso >= dueAt

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-primary-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden />Mes défis
        </Link>
        {solutionShared && (
          <Link href={`/defis/${activityId}/corrige`} className="ml-auto hidden items-center gap-2 rounded-[10px] bg-panel px-3.5 py-2 font-semibold text-primary-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-primary-wash md:inline-flex">
            <BookOpenCheck className="size-5" aria-hidden />Corrigé
          </Link>
        )}
      </div>

      <header className="glass overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 p-4 sm:px-6 sm:py-5">
          {number && (
            <span aria-hidden className="hidden size-16 shrink-0 place-items-center rounded-full bg-primary-wash text-[28px] font-semibold text-primary-ink sm:grid">{number}</span>
          )}
          <div className="min-w-0 flex-1">
            {number && <p className="text-[13px] text-muted">Défi n°{number}</p>}
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[48px]">{detail.title}</h1>
          </div>
          {dueAt && status !== 'validated' && <DeadlineBanner variant="hero" dueAt={dueAt} serverNow={nowIso} />}
        </div>
        <dl className="grid grid-cols-2 border-t border-line md:grid-cols-3">
          <div className="px-4 py-3 md:px-6"><dt className="text-[13px] text-muted">Statut</dt><dd className="mt-0.5"><StatusBadge status={status} /></dd></div>
          <div className="border-l border-line px-4 py-3 md:px-6"><dt className="text-[13px] text-muted">Date limite</dt><dd className="font-semibold">{dueAt ? formatDue(dueAt) : 'Aucune'}</dd></div>
          <div className="hidden border-l border-line px-6 py-3 md:block"><dt className="text-[13px] text-muted">Aides</dt><dd className="font-semibold">{detail.helpVideos.length === 0 ? 'Aucune vidéo' : `${detail.helpVideos.length} vidéo${detail.helpVideos.length > 1 ? 's' : ''}`}</dd></div>
        </dl>
      </header>

      {review && (
        <section aria-label={`Message de ${review.teacherName}`} className="glass seyes marge grid gap-x-6 overflow-hidden py-5 pr-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-8">{STATUS_LABELS[review.decision]} — message de {review.teacherName}</p>
            {review.comment && <TeacherInk className="max-w-[64ch] text-[24px]">{review.comment}</TeacherInk>}
            {/* Consigne de suite, tant que l'élève n'a pas renvoyé son projet. */}
            {status === review.decision && <p className="font-medium leading-8 text-primary-ink">{DECISION_NEXT_STEP[review.decision]}</p>}
          </div>
          <TeacherStamp decision={review.decision} className="mt-2 self-start text-[15px]" />
        </section>
      )}
      {progress?.autoSubmittedAt && status === 'submitted' && (
        <p role="status" className="rounded-xl bg-st-bad-bg p-4 font-medium text-st-bad">Temps écoulé : ton travail a été rendu automatiquement à ton professeur.</p>
      )}
      {status === 'not_submitted' && (
        <p role="status" className="rounded-xl bg-st-bad-bg p-4 font-medium text-st-bad">Temps écoulé : tu n’avais rien sauvegardé, le défi est marqué Non rendu.</p>
      )}
      {status === 'submitted' && !progress?.autoSubmittedAt && (
        <p className="rounded-xl bg-st-sent-bg p-4 font-medium text-st-sent">Ton défi est envoyé : ton professeur va le regarder. Tu peux le relancer avec le drapeau vert.</p>
      )}

      <DefiBrief title={detail.title} statementYoutubeId={detail.statementYoutubeId} instructions={detail.instructions} helpVideos={detail.helpVideos} />

      <DefiWorkspace activityId={activityId} editable={canEdit(status)} sandbox={status === 'validated'}
        submittable={canSubmit(status) && Boolean(progress?.projectPath) && !passed}
        submitBlocked={canEdit(status) && passed ? DEADLINE_PASSED : null}
        dueAt={status === 'validated' ? null : dueAt} serverNow={nowIso} />
    </div>
  )
}
