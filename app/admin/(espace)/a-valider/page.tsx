import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronRight, Send, Users } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { levelLabel } from '@/lib/levels'
import { pendingByClass, reviewQueue } from '@/lib/review/service'
import { ensureClosed } from '@/lib/deadlines/ensure'
import { quotaBlock, quotaState, readyActivityIds } from '@/lib/db/autograde'
import { now } from '@/lib/clock'
import { jobBadges, runStatus } from '@/lib/autograde/service'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { ClassAutograde } from './ClassAutograde'
import { isAiConfigured } from '@/lib/autograde/ai'
import { autogradeEnabled } from '@/lib/autograde/enabled'

export const metadata = { title: 'À valider' }
// Les actions de correction automatique de cette page vident la file après la réponse (after()) : jusqu'à 300 s.
export const maxDuration = 300

const plural = (n: number) => (n === 0 ? 'Aucun défi en attente' : `${n} défi${n > 1 ? 's' : ''} à valider`)

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const teacher = await requireTeacher()
  await ensureClosed()
  const { classe } = await searchParams
  const db = getDb()
  const classList = await pendingByClass(db, teacher.id)

  // 1. Choisir la classe.
  if (!classe) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Défis à valider</h1>
        {classList.length === 0 ? (
          <p className="glass p-6 text-muted">
            Vous n’avez pas encore de classe. <Link href="/admin/classes" className="font-semibold text-primary-ink hover:underline">Créez une classe</Link> et ajoutez-y vos élèves.
          </p>
        ) : (
          <>
            <p className="text-muted">Choisissez une classe.</p>
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Classes">
              {classList.map((c) => {
                const body = (
                  <>
                    <Users className={`size-6 shrink-0 ${c.pending ? 'text-primary' : 'text-muted'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="text-sm text-muted">{levelLabel(c.level)} · {plural(c.pending)}</span>
                    </span>
                    {c.pending > 0 && <span className="grid h-8 min-w-8 place-items-center rounded-full bg-cta px-2 font-bold text-white" aria-hidden>{c.pending}</span>}
                  </>
                )
                return (
                  <li key={c.classId}>
                    {c.pending > 0 ? (
                      <Link href={`/admin/a-valider?classe=${c.classId}`} className="glass flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
                        {body}<ChevronRight className="size-5 text-primary" aria-hidden />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-4 rounded-2xl bg-tile-muted p-5 text-muted">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    )
  }

  // 2. Les défis de la classe choisie.
  const cls = classList.find((c) => c.classId === classe)
  if (!cls) notFound()
  const queue = await reviewQueue(db, teacher.id, cls.classId)
  const ready = await readyActivityIds(db)
  const badges = await jobBadges(db, queue.map((q) => q.progressId))
  const eligible = queue.filter((q) => ready.has(q.activityId) && badges.get(q.progressId)?.kind !== 'running').length
  const skipped = queue.filter((q) => !ready.has(q.activityId)).length
  const run = await runStatus(db, teacher.id, cls.classId)
  // Ce garde ne couvre que la requête du plafond (table des exécutions). La migration 0002 (colonne « attempts » lue
  // par jobBadges, latestJob et pendingProposals) doit être appliquée en ligne AVANT de déployer ce code.
  const quotaMessage = autogradeEnabled() ? quotaBlock(await quotaState(db, now()), eligible) : null
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/a-valider" className="inline-flex items-center gap-2 font-semibold text-primary-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden />Toutes les classes
      </Link>
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Défis à valider — {cls.name}</h1>
      {autogradeEnabled() && <ClassAutograde classId={cls.classId} eligible={eligible} skipped={skipped} initialRun={run} aiConfigured={isAiConfigured()} quotaMessage={quotaMessage} />}
      {queue.length === 0 ? (
        <p className="glass p-6 text-muted">Aucun défi en attente dans cette classe.</p>
      ) : (
        <ol className="space-y-3">
          {queue.map((q) => (
            <li key={q.progressId}>
              <Link href={`/admin/revue/${q.progressId}?classe=${cls.classId}`} className="glass flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
                <Send className="size-6 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-semibold">{q.studentName} — {q.activityTitle}</span>
                  <span className="text-sm text-muted">Envoyé le {new Date(q.submittedAt).toLocaleString('fr-FR')}</span>
                  {q.autoSubmitted && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-danger">Rendu automatiquement — hors délai</span>}
                  {(() => {
                    const b = badges.get(q.progressId)
                    if (!b) return null
                    const [cls2, text] = b.kind === 'running' ? ['bg-violet-100 text-primary-ink', 'Correction en cours']
                      : b.kind === 'proposed' ? ['bg-green-100 text-cta', `Correction proposée : ${STATUS_LABELS[b.decision]}`]
                        : ['bg-red-100 text-danger', 'Échec de la correction']
                    return <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${cls2}`}>{text}</span>
                  })()}
                </span>
                <span className="font-semibold text-primary-ink" aria-hidden>Ouvrir</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
