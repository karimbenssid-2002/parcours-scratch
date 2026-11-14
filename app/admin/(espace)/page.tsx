import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, Clock, Send, Sparkles } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { countPendingRequests } from '@/lib/db/teacher-requests'
import { listClassesForTeacher } from '@/lib/db/classes'
import { pendingByClass, reviewQueue } from '@/lib/review/service'
import { jobBadges } from '@/lib/autograde/service'
import { listUnseenNotices } from '@/lib/deadlines/notices'
import { levelLabel } from '@/lib/levels'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { levelTone } from '@/lib/ui/scratch-colors'
import { LateNotices } from './LateNotices'
import { ensureClosed } from '@/lib/deadlines/ensure'
import { NotificationsToggle } from '@/components/pwa/NotificationsToggle'
import { SourceLink } from '@/components/layout/SourceLink'
import { pushEnabled, vapidPublicKey } from '@/lib/push/config'

export const metadata = { title: 'Tableau de bord' }

const QUEUE_SHOWN = 8
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const sentAt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' })
const today = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Casablanca' })

export default async function AdminHome() {
  const teacher = await requireTeacher()
  await ensureClosed()
  const db = getDb()
  const pending = teacher.role === 'admin' ? await countPendingRequests(db) : 0
  const queue = await reviewQueue(db, teacher.id)
  const badges = await jobBadges(db, queue.map((q) => q.progressId))
  const classes = await listClassesForTeacher(db, teacher.id)
  const pendingOf = new Map((await pendingByClass(db, teacher.id)).map((c) => [c.classId, c.pending]))
  const notices = await listUnseenNotices(db, teacher.id)
  const publicKey = pushEnabled() ? vapidPublicKey() : null
  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted first-letter:uppercase">{today()}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px]">Bonjour {teacher.firstName}</h1>
            <span className="rounded-full bg-primary-2/10 px-3 py-1 text-sm font-semibold text-primary-ink">Espace enseignant</span>
          </div>
        </div>
        <span className="hidden rounded-[10px] bg-white px-3.5 py-2 shadow-clay sm:block">
          <Image src="/brand/lycee-malraux.png" alt="Lycée Français International André-Malraux" width={98} height={36} style={{ height: 36, width: 'auto' }} />
        </span>
      </header>

      {publicKey && <NotificationsToggle app="admin" publicKey={publicKey} variant="accueil" />}

      <LateNotices notices={notices} />

      {teacher.role === 'admin' && pending > 0 && (
        <p className="glass flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="font-semibold">{pending} demande{pending > 1 ? 's' : ''} de compte enseignant en attente.</span>
          <Link href="/admin/demandes" className="font-semibold text-primary-ink hover:underline">Voir les demandes</Link>
        </p>
      )}

      <section aria-labelledby="a-valider" className="glass overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-5">
          <h2 id="a-valider" className="text-2xl font-semibold">À valider</h2>
          <span className="rounded-lg bg-st-sent-bg px-2.5 py-1 text-[13px] font-medium text-st-sent">
            {queue.length === 0 ? 'Aucun défi en attente' : `${queue.length} envoyé${queue.length > 1 ? 's' : ''}`}
          </span>
          <Link href="/admin/a-valider" className="ml-auto font-semibold text-primary-ink hover:underline">Par classe</Link>
        </div>
        {queue.length === 0 ? (
          <p className="px-5 pb-5 text-muted">Vos élèves n’ont envoyé aucun défi pour l’instant.</p>
        ) : (
          <>
          {/* Téléphone : une carte par envoi. */}
          <ul className="md:hidden">
            {queue.slice(0, QUEUE_SHOWN).map((q, i) => {
              const b = badges.get(q.progressId)
              return (
                <li key={q.progressId} className={`border-t border-line ${i === 0 ? 'bg-surligne/15' : ''}`}>
                  <Link href={`/admin/revue/${q.progressId}`} className="flex items-start gap-3 px-4 py-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-tile-muted text-[13px] font-semibold">{initials(q.studentName)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2"><b className="truncate font-semibold">{q.studentName}</b><span className="shrink-0 text-[13px] text-muted">{sentAt(q.submittedAt)}</span></span>
                      <span className="block text-sm">{q.activityTitle}</span>
                      {(q.autoSubmitted || b?.kind === 'proposed') && (
                        <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12.5px] font-medium ${q.autoSubmitted ? 'bg-st-bad-bg text-st-bad' : 'bg-st-ok-bg text-st-ok'}`}>
                          {q.autoSubmitted ? <><Clock className="size-3.5" aria-hidden />Rendu automatiquement</> : <><Sparkles className="size-3.5" aria-hidden />{b?.kind === 'proposed' ? STATUS_LABELS[b.decision] : ''}</>}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="mt-1 size-[18px] shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <caption className="sr-only">Défis envoyés par vos élèves, du plus ancien au plus récent</caption>
              <thead className="border-b border-line text-[13px] text-muted">
                <tr><th className="px-5 py-3 font-medium">Envoyé</th><th className="px-3 py-3 font-medium">Élève</th><th className="px-3 py-3 font-medium">Défi</th><th className="px-3 py-3 font-medium">Correction auto</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody>
                {queue.slice(0, QUEUE_SHOWN).map((q, i) => {
                  const b = badges.get(q.progressId)
                  return (
                    <tr key={q.progressId} className={`border-b border-line last:border-0 ${i === 0 ? 'bg-surligne/15' : ''}`}>
                      <td className="whitespace-nowrap px-5 py-3 text-[15px] text-muted">{sentAt(q.submittedAt)}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5 whitespace-nowrap font-semibold">
                          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-tile-muted text-[13px]">{initials(q.studentName)}</span>{q.studentName}
                        </span>
                      </td>
                      <td className="px-3 py-3">{q.activityTitle}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {q.autoSubmitted ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-st-bad-bg px-2.5 py-1 text-[13px] font-medium text-st-bad"><Clock className="size-3.5" aria-hidden />Rendu automatiquement</span>
                          : b?.kind === 'proposed' ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-st-ok-bg px-2.5 py-1 text-[13px] font-medium text-st-ok"><Sparkles className="size-3.5" aria-hidden />{STATUS_LABELS[b.decision]}</span>
                            : b?.kind === 'running' ? <span className="text-[13px] text-muted">En cours…</span>
                              : <span className="text-[13px] text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/admin/revue/${q.progressId}`} aria-label={`Ouvrir le défi « ${q.activityTitle} » de ${q.studentName}`}
                          className="inline-flex items-center gap-1 rounded-[10px] bg-primary px-3.5 py-2 font-semibold text-white hover:bg-primary-2">
                          Ouvrir<ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {queue.length > QUEUE_SHOWN && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted">
                Et {queue.length - QUEUE_SHOWN} autre{queue.length - QUEUE_SHOWN > 1 ? 's' : ''}. <Link href="/admin/a-valider" className="font-semibold text-primary-ink hover:underline">Voir par classe</Link>
              </p>
            )}
          </div>
          </>
        )}
      </section>

      <section aria-labelledby="mes-classes" className="space-y-3">
        <h2 id="mes-classes" className="text-2xl font-semibold">Mes classes</h2>
        {classes.length === 0 ? (
          <p className="glass p-6 text-muted">Vous n’avez pas encore de classe. <Link href="/admin/classes" className="font-semibold text-primary-ink hover:underline">Créez votre première classe</Link>.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {classes.map((c) => {
              const n = pendingOf.get(c.id) ?? 0
              return (
                <li key={c.id}>
                  <Link href={`/admin/classes/${c.id}`} className="glass relative block overflow-hidden p-4 pt-5 transition hover:-translate-y-0.5 md:p-5 md:pt-6">
                    <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${levelTone(c.level).split(' ')[0]}`} />
                    <span className="flex items-center justify-between gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[13px] font-semibold ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
                      <span className="text-[13px] text-muted">{c.studentCount} élève{c.studentCount > 1 ? 's' : ''}</span>
                    </span>
                    <span className="mt-2 block truncate text-xl font-semibold md:mt-3 md:text-2xl">{c.name}</span>
                    <span className="mt-2 block md:mt-3">
                      {n > 0
                        ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-st-sent-bg px-2.5 py-1 text-[13px] font-medium text-st-sent"><Send className="size-3.5" aria-hidden />{n} à valider</span>
                        : <span className="text-[13px] text-muted">À jour</span>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="pt-3"><SourceLink /></footer>
    </div>
  )
}
