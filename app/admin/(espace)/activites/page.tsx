import Link from 'next/link'
import { Search } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listActivitiesAdmin } from '@/lib/db/activities'
import { readyActivityIds } from '@/lib/db/autograde'
import { levelLabel } from '@/lib/levels'
import { NewActivityForm } from './NewActivityForm'

export const metadata = { title: 'Activités' }

const SOURCE_LABELS = { upload: 'Fichier envoyé', capytale: 'Capytale', breizh: 'Breizh' } as const

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  await requireTeacher({ role: 'admin' })
  const { q = '', statut } = await searchParams
  const status = statut === 'draft' || statut === 'published' ? statut : undefined
  const rows = await listActivitiesAdmin(getDb(), { q, status })
  const ready = await readyActivityIds(getDb())
  const filterHref = (s?: string) => `/admin/activites?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { statut: s } : {}) })}`

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Activités</h1>
      <NewActivityForm />
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-1 items-center gap-2" role="search">
          {status && <input type="hidden" name="statut" value={status} />}
          <label htmlFor="q" className="sr-only">Rechercher une activité</label>
          <input id="q" name="q" defaultValue={q} placeholder="Rechercher par titre…" className="min-w-48 flex-1 rounded-xl border-2 border-line bg-white px-4 py-2.5" />
          <button type="submit" className="grid size-11 cursor-pointer place-items-center rounded-xl bg-primary text-white" aria-label="Rechercher"><Search className="size-5" aria-hidden /></button>
        </form>
        <nav aria-label="Filtrer par statut" className="flex gap-2 text-sm font-semibold">
          {[[undefined, 'Toutes'], ['draft', 'Brouillons'], ['published', 'Publiées']].map(([s, label]) => (
            <Link key={label} href={filterHref(s)} aria-current={status === s ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 ${status === s ? 'bg-primary text-white' : 'bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)]'}`}>{label}</Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="glass p-6 text-muted">Aucune activité ne correspond.</p>
      ) : (
        <div className="glass relative overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Bibliothèque d’activités</caption>
            <thead className="border-b border-line text-sm text-muted">
              <tr><th className="p-3">Titre</th><th className="p-3">Niveaux</th><th className="p-3">Statut</th><th className="p-3">Projet de départ</th><th className="p-3">Aides</th><th className="p-3">Correction auto.</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-semibold"><Link href={`/admin/activites/${r.id}`} className="text-primary-ink hover:underline">{r.title}</Link></td>
                  <td className="p-3">{r.levels.length ? r.levels.map(levelLabel).join(', ') : <span className="text-muted">—</span>}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${r.status === 'published' ? 'bg-green-100 text-cta' : 'bg-slate-100 text-slate-700'}`}>
                      {r.status === 'published' ? 'Publiée' : 'Brouillon'}
                    </span>
                  </td>
                  <td className="p-3">{r.starterSource ? SOURCE_LABELS[r.starterSource] : <span className="text-muted">Aucun</span>}</td>
                  <td className="p-3">{r.helpCount}</td>
                  <td className="p-3">{ready.has(r.id) ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-semibold text-cta">Prête</span> : <span className="text-muted">Non préparée</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
