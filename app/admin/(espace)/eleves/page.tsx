import { Search } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listAllStudents } from '@/lib/db/students'
import { LEVELS, levelLabel, parseLevel } from '@/lib/levels'
import { StudentRow } from './StudentRow'

export const metadata = { title: 'Élèves' }

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; niveau?: string }> }) {
  await requireTeacher({ role: 'admin' })
  const { q = '', niveau } = await searchParams
  const level = parseLevel(niveau) ?? undefined
  const students = await listAllStudents(getDb(), { q, level })
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Élèves</h1>
      <form className="flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="q" className="sr-only">Rechercher un élève</label>
        <input id="q" name="q" defaultValue={q} placeholder="Nom ou adresse e-mail…" className="min-w-60 flex-1 rounded-xl border-2 border-line bg-white px-4 py-2.5" />
        <label htmlFor="niveau" className="sr-only">Niveau</label>
        <select id="niveau" name="niveau" defaultValue={level ?? ''} className="rounded-xl border-2 border-line bg-white px-4 py-2.5">
          <option value="">Tous les niveaux de classe</option>
          {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
        </select>
        <button type="submit" className="grid size-11 cursor-pointer place-items-center rounded-xl bg-primary text-white" aria-label="Rechercher"><Search className="size-5" aria-hidden /></button>
      </form>
      <p className="text-sm text-muted">{students.length} élève{students.length > 1 ? 's' : ''}</p>
      {students.length > 0 && (
        <div className="glass relative overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Tous les élèves inscrits</caption>
            <thead className="border-b border-line text-sm text-muted">
              <tr><th className="p-3">Élève</th><th className="p-3">Niveau</th><th className="p-3">Classes</th><th className="p-3">Dernière connexion</th></tr>
            </thead>
            <tbody>{students.map((s) => <StudentRow key={s.id} student={s} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
