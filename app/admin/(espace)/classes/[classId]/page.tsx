import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
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
  // Sur téléphone, une seule partie de la page à la fois (sur ordinateur, tout reste visible).
  const tab = onglet === 'defis' || onglet === 'eleves' ? onglet : 'suivi'
  const onPhone = (t: string) => (tab === t ? '' : 'max-md:hidden')
  const db = getDb()
  const cls = await getClassForTeacher(db, teacher.id, classId)
  if (!cls) notFound()
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

      {/* Ordinateur : raccourcis vers les trois parties. Téléphone : onglets, une partie à la fois. */}
      <nav aria-label="Parties de la page" className="hidden gap-2 md:flex">
        <a href="#suivi" className="inline-flex items-center rounded-[10px] bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-2">Suivi</a>
        <a href="#defis" className="inline-flex items-center rounded-[10px] bg-panel px-4 py-2 font-semibold shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-primary-wash">Défis de la classe · {assignments.length}</a>
        <a href="#eleves" className="inline-flex items-center rounded-[10px] bg-panel px-4 py-2 font-semibold shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-primary-wash">Élèves · {grid.rows.length}</a>
      </nav>
      <nav aria-label="Onglets de la classe" className="flex rounded-xl bg-tile-muted p-1 md:hidden">
        {([['suivi', 'Suivi'], ['defis', `Défis · ${assignments.length}`], ['eleves', `Élèves · ${grid.rows.length}`]] as const).map(([t, label]) => (
          <Link key={t} href={t === 'suivi' ? `/admin/classes/${cls.id}` : `/admin/classes/${cls.id}?onglet=${t}`} aria-current={tab === t ? 'page' : undefined}
            className={`flex-1 rounded-[9px] py-2 text-center text-sm ${tab === t ? 'bg-panel font-semibold shadow-[0_1px_3px_rgb(20_27_51/.12)]' : 'font-medium text-muted'}`}>{label}</Link>
        ))}
      </nav>

      <section aria-labelledby="suivi" className={`scroll-mt-6 space-y-3 ${onPhone('suivi')}`}>
        <h2 id="suivi" className="text-2xl font-semibold max-md:sr-only">Suivi des défis</h2>
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
      </section>

      <section aria-labelledby="defis" className={`scroll-mt-6 space-y-3 ${onPhone('defis')}`}>
        <h2 id="defis" className="text-2xl font-semibold">Défis de la classe</h2>
        <p className="text-muted">Vos élèves ne voient que ces défis, dans cet ordre. Les dates limites sont à l’heure du Maroc.</p>
        {/* Remonté seulement quand l'ensemble des défis change (ajout depuis le stock) : garde focus et messages. */}
        <ClassAssignments key={assignments.map((a) => a.activityId).sort().join()} classId={cls.id} assignments={assignments} isAdmin={teacher.role === 'admin'} />
        <ThemePicker classId={cls.id} classLevel={cls.level} progressions={progressions} stock={stock} assigned={assignments.map((a) => a.activityId)} />
      </section>

      <section aria-labelledby="eleves" className={`grid scroll-mt-6 gap-6 lg:grid-cols-2 ${onPhone('eleves')}`}>
        <div className="space-y-3">
          <h2 id="eleves" className="text-2xl font-semibold">Élèves ({grid.rows.length})</h2>
          <MemberList classId={cls.id} members={grid.rows.map((r) => r.member)} />
        </div>
        <AddStudentsForm classId={cls.id} />
      </section>
    </div>
  )
}
