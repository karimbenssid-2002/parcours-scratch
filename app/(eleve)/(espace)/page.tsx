import Image from 'next/image'
import Link from 'next/link'
import { Blocks, Monitor, Pencil, Play, Sparkles } from 'lucide-react'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listStudentDefis } from '@/lib/db/assignments'
import { studentClasses } from '@/lib/db/classes'
import { progressByActivity, recentReviewsForStudent } from '@/lib/db/progress'
import { now } from '@/lib/clock'
import { nextDeadline } from '@/lib/deadlines/next'
import { formatDue } from '@/lib/deadlines/time'
import { nextStep } from '@/lib/progress/next-step'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { levelTone, statusFill } from '@/lib/ui/scratch-colors'
import { levelsLabel } from '@/lib/levels'
import { ActivityCard } from '@/components/eleve/ActivityCard'
import { FeedbackPanel } from '@/components/eleve/FeedbackPanel'
import { NextDeadlineCard } from '@/components/eleve/NextDeadlineCard'
import { StatusBadge } from '@/components/eleve/StatusBadge'
import { TeacherInk } from '@/components/eleve/TeacherNote'
import { ensureClosed } from '@/lib/deadlines/ensure'

export const metadata = { title: 'Mes défis' }

const STEP = {
  correct: { title: 'Prochaine étape · à corriger', action: 'Corriger mon défi', cls: 'bg-encre', Icon: Pencil },
  continue: { title: 'Prochaine étape · à continuer', action: 'Continuer mon défi', cls: 'bg-primary', Icon: Play },
  start: { title: 'Prochaine étape · à commencer', action: 'Commencer ce défi', cls: 'bg-primary', Icon: Play },
} as const

export default async function StudentHome() {
  const student = await requireStudent()
  await ensureClosed()
  const db = getDb()
  const items = await listStudentDefis(db, student.id)
  const classes = await studentClasses(db, student.email)
  const statuses = await progressByActivity(db, student.id)
  const recent = await recentReviewsForStudent(db, student.id, items.map((i) => i.activityId))
  const status = (id: string) => statuses.get(id) ?? 'not_started'
  const count = (s: string) => items.filter((i) => status(i.activityId) === s).length
  const validated = count('validated')
  const nowMs = now().getTime()
  const next = nextDeadline(items, statuses, nowMs)
  const step = nextStep(items, statuses)
  const stepNote = step && recent.find((r) => r.activityId === step.item.activityId)
  const levels = levelsLabel(classes.map((c) => c.level))
  const numbers = new Map(items.map((i) => [i.activityId, i.number]))

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-muted">
            Bonjour {student.firstName} !
            <span className={`rounded-md px-2 py-0.5 text-[13px] font-semibold ${levelTone(levels)}`}>{levels}</span>
          </p>
          <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.02em] md:text-[46px]">Mes défis</h1>
        </div>
        {items.length > 0 && (
          <div className="sm:text-right">
            <div role="progressbar" aria-label="Progression du parcours" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={validated}
              className="flex max-w-[480px] flex-wrap gap-1 sm:justify-end">
              {/* Un segment par défi, couleur de son statut. */}
              {items.map((i) => (
                <span key={i.activityId} title={`${i.title} : ${STATUS_LABELS[status(i.activityId)]}`}
                  className={`h-5 w-3.5 rounded ${statusFill[status(i.activityId)]}`} />
              ))}
            </div>
            <p className="mt-2 text-muted">
              <b className="text-xl font-semibold text-ink">{validated}</b> / {items.length} validés
              {count('submitted') > 0 && ` · ${count('submitted')} envoyé${count('submitted') > 1 ? 's' : ''}`}
              {count('almost') + count('needs_work') > 0 && ` · ${count('almost') + count('needs_work')} à corriger`}
            </p>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="glass p-8 text-center">
          <Sparkles className="mx-auto size-10 text-primary-soft" aria-hidden />
          <p className="mt-3 text-2xl font-semibold">Les défis arrivent bientôt !</p>
          <p className="text-muted">{classes.length > 0 ? 'Ton professeur ne t’a pas encore donné de défi.' : 'Ton professeur ne t’a pas encore inscrit dans une classe.'}</p>
        </div>
      ) : (
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            {step && (
              <section aria-labelledby="etape" className="glass overflow-hidden">
                <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:gap-6 sm:p-5">
                  <div className="relative aspect-[4/3] self-start overflow-hidden rounded-xl bg-thumb">
                    {step.item.thumbnail
                      ? <Image src={step.item.thumbnail} alt="" fill sizes="260px" className="object-contain p-1" />
                      : <Blocks className="absolute inset-0 m-auto size-12 text-primary-soft" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <p className={`inline-flex rounded-lg px-2.5 py-1 text-[13px] font-medium ${step.kind === 'correct' ? 'bg-st-almost-bg text-st-almost' : 'bg-primary-wash text-primary-ink'}`}>{STEP[step.kind].title}</p>
                    <h2 id="etape" className="mt-2 text-[21px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">{step.item.title}</h2>
                    {stepNote && (
                      <div className="seyes marge mt-2 hidden rounded-[10px] py-1 pr-3 shadow-[inset_0_0_0_1px_var(--color-line)] sm:block">
                        <TeacherInk className="line-clamp-2">{stepNote.comment}</TeacherInk>
                        <p className="text-[13px] leading-8 text-muted">{stepNote.teacherName} · {formatDue(stepNote.createdAt)}</p>
                      </div>
                    )}
                    {/* Sur téléphone, pas d'éditeur : le défi se travaille sur ordinateur. */}
                    <p className="mt-3 flex items-center gap-2 text-sm text-muted md:hidden"><Monitor className="size-4" aria-hidden />{step.kind === 'correct' ? 'À corriger' : step.kind === 'continue' ? 'À continuer' : 'À commencer'} sur un ordinateur</p>
                    <Link href={`/defis/${step.item.activityId}`}
                      className={`mt-4 hidden md:inline-flex md:min-h-[42px] items-center gap-2 rounded-[10px] px-4 py-2.5 font-semibold text-white transition hover:brightness-110 ${STEP[step.kind].cls}`}>
                      {(() => { const I = STEP[step.kind].Icon; return <I className="size-[18px]" aria-hidden /> })()}{STEP[step.kind].action}
                    </Link>
                  </div>
                </div>
                {stepNote && (
                  <div className="seyes marge border-t border-line py-1 pr-4 sm:hidden">
                    <TeacherInk className="line-clamp-3">{stepNote.comment}</TeacherInk>
                    <p className="text-[13px] leading-8 text-muted">{stepNote.teacherName} · {formatDue(stepNote.createdAt)}</p>
                  </div>
                )}
                <dl className="hidden border-t border-line sm:grid sm:grid-cols-[auto_1fr_1fr]">
                  <div className="px-5 py-3"><dt className="text-[13px] text-muted">Défi</dt><dd className="font-semibold">{step.item.section === 'mini-projet' ? 'Mini-projet' : `n°${step.item.number}`}</dd></div>
                  <div className="border-l border-line px-5 py-3"><dt className="text-[13px] text-muted">Statut</dt><dd className="mt-0.5"><StatusBadge status={status(step.item.activityId)} /></dd></div>
                  <div className="col-span-2 border-t border-line px-5 py-3 sm:col-span-1 sm:border-l sm:border-t-0"><dt className="text-[13px] text-muted">Date limite</dt><dd className="font-semibold">{step.item.dueAt ? formatDue(step.item.dueAt) : 'Aucune'}</dd></div>
                </dl>
              </section>
            )}

            {next && <div className="lg:hidden"><NextDeadlineCard next={next} nowMs={nowMs} /></div>}
            <h2 className="text-lg font-semibold md:hidden">Tous les défis</h2>
            <section aria-label="Liste des défis" className="glass overflow-hidden">
              <ul>
                {items.map((item) => (
                  <li key={item.activityId}>
                    <ActivityCard item={item} status={status(item.activityId)} nowMs={nowMs}
                      highlighted={status(item.activityId) === 'in_progress' && step?.item.activityId === item.activityId} />
                  </li>
                ))}
              </ul>
            </section>

            <p className="flex items-start gap-2.5 rounded-xl bg-primary-wash p-3.5 text-sm font-medium text-primary-ink md:hidden">
              <Monitor className="mt-0.5 size-[18px] shrink-0" aria-hidden />Pour coder tes défis, utilise un ordinateur ou une tablette. Ici, tu suis ton avancement.
            </p>
          </div>

          {/* Sur téléphone, les retours sont dans l'onglet « Retours ». */}
          <div className="hidden space-y-6 md:block">
            {next && <div className="hidden lg:block"><NextDeadlineCard next={next} nowMs={nowMs} /></div>}
            {recent.length > 0 && <FeedbackPanel reviews={recent} numbers={numbers} />}
          </div>
        </div>
      )}
    </div>
  )
}
