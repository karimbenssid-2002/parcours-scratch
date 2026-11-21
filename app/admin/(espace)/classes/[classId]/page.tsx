import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChartLine, Flag, Plus, UserPlus, Users } from 'lucide-react'
import { buttonClasses } from '@/components/ui/Button'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { classGrid, getClassForTeacher } from '@/lib/db/classes'
import { listClassAssignments, listPublishedStock } from '@/lib/db/assignments'
import { PROGRESS_STATUSES, type ProgressStatus } from '@/lib/db/schema'
import { STATUS_LABELS } from '@/lib/progress/rules'
import { StatusCell } from '@/components/admin/StatusCell'
import { ClassHeader } from './ClassHeader'
import { AddStudentsForm } from './AddStudentsForm'
import { MemberList } from './MemberList'
import { ClassAssignments } from './ClassAssignments'
import { ThemePicker } from './ThemePicker'
import { listProgression, type Theme } from '@/lib/db/progressions'
import { LEVELS, type Level } from '@/lib/levels'
import { PhoneTracking } from './PhoneTracking'
import { ensureClosed } from '@/lib/deadlines/ensure'

export const metadata = { title: 'Classe' }

export default async function ClassPage({ params, searchParams }: {
  params: Promise<{ classId: string }>; searchParams: Promise<{ statut?: string; vue?: string; defi?: string; onglet?: string }>
}) {
  const teacher = await requireTeacher()
  await ensureClosed()
  const { classId } = await params
  const { statut, vue, defi, onglet } = await searchParams
  // Une seule partie de la page à la fois (onglet dans l'adresse : Retour et actualisation le gardent).
  const tab = onglet === 'defis' || onglet === 'eleves' ? onglet : 'suivi'
  const db = getDb()
  const cls = await getClassForTeacher(db, teacher.id, classId)
  if (!cls) notFound()
  const tabHref = (t: 'suivi' | 'defis' | 'eleves') => (t === 'suivi' ? `/admin/classes/${cls.id}` : `/admin/classes/${cls.id}?onglet=${t}`)
  const grid = await classGrid(db, cls)
  const assignments = await listClassAssignments(db, cls.id)
  const stock = await listPublishedStock(db)
  const progressions = Object.fromEntries(await Promise.all(LEVELS.map(async (l) => [l, await listProgression(db, l, { publishedOnly: true })] as const))) as Record<Level, Theme[]>
  const filter = (PROGRESS_STATUSES as readonly string[]).includes(statut ?? '') ? (statut as ProgressStatus) : null
  const statusOf = (row: (typeof grid.rows)[number], activityId: string): ProgressStatus => row.statuses[activityId]?.status ?? 'not_started'
  const enrolled = grid.rows.filter((r) => r.member.student)
  const rows = enrolled.filter((r) => !filter || grid.activities.some((a) => statusOf(r, a.activityId) === filter))
  const counts = Object.fromEntries(PROGRESS_STATUSES.map((s) => [s,
    enrolled.reduce((n, r) => n + grid.activities.filter((a) => statusOf(r, a.activityId) === s).length, 0)]))

  return (
    <div className="mx-auto max-w-7xl space-y-5 md:space-y-8">
      <Link href="/admin/classes" className="inline-flex items-center gap-2 font-semibold text-primary-ink hover:underline"><ArrowLeft className="size-4" aria-hidden />Mes classes</Link>
      <ClassHeader classId={cls.id} name={cls.name} level={cls.level} />

      {/* Une seule partie à la fois. Ordinateur : onglets soulignés (avec l'action propre à l'onglet). Téléphone : contrôle segmenté. */}
      <nav aria-label="Parties de la classe" className="hidden flex-wrap items-end gap-1 border-b-2 border-line md:flex">
        {([['suivi', 'Suivi', ChartLine, null], ['defis', 'Défis de la classe', Flag, assignments.length], ['eleves', 'Élèves', Users, grid.rows.length]] as const).map(([t, label, Icon, count]) => (
          <Link key={t} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}
            className={`-mb-0.5 inline-flex min-h-[52px] items-center gap-2.5 border-b-[3px] px-5 py-3 text-[17px] ${tab === t ? 'border-primary font-semibold text-primary-ink' : 'border-transparent font-medium text-muted hover:rounded-t-[10px] hover:bg-primary-wash hover:text-ink'}`}>
            <Icon className="size-5" aria-hidden />{label}
            {count !== null && <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold ${tab === t ? 'bg-primary-wash text-primary-ink' : 'bg-line text-muted'}`}>{count}</span>}
          </Link>
        ))}
        <span className="flex-1" />
        {tab === 'defis' && <a href="#donner" className={buttonClasses('primary', 'mb-2')}><Plus className="size-4" aria-hidden />Donner des défis</a>}
        {tab === 'eleves' && <a href="#emails" className={buttonClasses('primary', 'mb-2')}><UserPlus className="size-4" aria-hidden />Ajouter des élèves</a>}
      </nav>
      <nav aria-label="Onglets de la classe" className="flex rounded-xl bg-tile-muted p-1 md:hidden">
        {([['suivi', 'Suivi'], ['defis', `Défis · ${assignments.length}`], ['eleves', `Élèves · ${grid.rows.length}`]] as const).map(([t, label]) => (
          <Link key={t} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}
            className={`flex-1 rounded-[9px] py-2 text-center text-sm ${tab === t ? 'bg-panel font-semibold shadow-[0_1px_3px_rgb(20_27_51/.12)]' : 'font-medium text-muted'}`}>{label}</Link>
        ))}
      </nav>

      {tab === 'suivi' && <section aria-labelledby="suivi" className="space-y-3">
        <h2 id="suivi" className="sr-only">Suivi des défis</h2>
        <nav aria-label="Filtrer par statut" className="hidden flex-wrap gap-2 text-sm font-medium md:flex">
          <Link href={`/admin/classes/${cls.id}`} className={`rounded-full px-3 py-1.5 ${!filter ? 'bg-ink text-white' : 'bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-primary-wash'}`}>Tous</Link>
          {PROGRESS_STATUSES.map((s) => (
            <Link key={s} href={`/admin/classes/${cls.id}?statut=${s}`} className={`rounded-full px-3 py-1.5 ${filter === s ? 'bg-ink text-white' : 'bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-primary-wash'}`}>
              {STATUS_LABELS[s]} ({counts[s]})
            </Link>
          ))}
        </nav>
        {grid.activities.length === 0 ? (
          <p className="glass p-6 text-muted">Aucun défi donné à cette classe.</p>
        ) : rows.length === 0 ? (
          <p className="glass p-6 text-muted">Aucun élève inscrit ne correspond.</p>
        ) : (
          <>
          <PhoneTracking classId={cls.id} activities={grid.activities} view={vue === 'eleves' ? 'eleves' : 'defis'} defiId={defi ?? null}
            rows={enrolled.map((r) => ({ name: `${r.member.student!.firstName} ${r.member.student!.lastName}`, studentId: r.member.student!.id, statuses: r.statuses }))} />
          <div className="glass relative hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <caption className="sr-only">Statut de chaque défi pour chaque élève</caption>
              <thead className="border-b border-line text-[13px] text-muted">
                <tr>
                  <th className="sticky left-0 z-[1] bg-panel p-3 pl-5 font-medium">Élève</th>
                  {grid.activities.map((a) => <th key={a.activityId} className="p-3 text-center font-medium" title={a.title}>n°{a.number}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.member.email} className="border-b border-line last:border-0">
                    <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap bg-panel p-3 pl-5 font-semibold">
                      <Link href={`/admin/suivi/eleves/${r.member.student!.id}`} className="hover:underline">{r.member.student!.firstName} {r.member.student!.lastName}</Link>
                    </th>
                    {grid.activities.map((a) => {
                      const cell = r.statuses[a.activityId]
                      const st = cell?.status ?? 'not_started'
                      // Filtre actif : seules les cases du statut choisi restent, les autres colonnes sont vides.
                      if (filter && st !== filter) return <td key={a.activityId} className="p-2 text-center"><span className="inline-block size-9" aria-hidden /></td>
                      return <td key={a.activityId} className="p-2 text-center"><StatusCell status={st} href={cell ? `/admin/revue/${cell.progressId}` : undefined} /></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>}

      {tab === 'defis' && <section aria-labelledby="defis" className="space-y-3">
        <h2 id="defis" className="text-2xl font-semibold md:sr-only">Défis de la classe</h2>
        <p className="text-muted">Vos élèves ne voient que ces défis, dans cet ordre. Les dates limites sont à l’heure du Maroc.</p>
        {/* Remonté seulement quand l'ensemble des défis change (ajout depuis le stock) : garde focus et messages. */}
        <ClassAssignments key={assignments.map((a) => a.activityId).sort().join()} classId={cls.id} assignments={assignments} isAdmin={teacher.role === 'admin'} />
        <ThemePicker classId={cls.id} classLevel={cls.level} progressions={progressions} stock={stock} assigned={assignments.map((a) => a.activityId)} />
      </section>}

      {tab === 'eleves' && <section aria-labelledby="eleves" className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 id="eleves" className="text-2xl font-semibold md:sr-only">Élèves ({grid.rows.length})</h2>
          <MemberList classId={cls.id} members={grid.rows.map((r) => r.member)} />
        </div>
        <AddStudentsForm classId={cls.id} />
      </section>}
    </div>
  )
}
