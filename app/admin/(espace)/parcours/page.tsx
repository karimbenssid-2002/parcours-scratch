import Link from 'next/link'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listActivitiesAdmin } from '@/lib/db/activities'
import { listProgression } from '@/lib/db/progressions'
import { LEVELS, levelLabel, parseLevel } from '@/lib/levels'
import { ProgressionEditor } from './ProgressionEditor'

export const metadata = { title: 'Progressions' }

export default async function ParcoursPage({ searchParams }: { searchParams: Promise<{ niveau?: string }> }) {
  await requireTeacher({ role: 'admin' })
  const level = parseLevel((await searchParams).niveau) ?? '6'
  const db = getDb()
  const themes = await listProgression(db, level)
  const stock = (await listActivitiesAdmin(db, {})).map((a) => ({ id: a.id, title: a.title, status: a.status }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Progressions</h1>
      <p className="text-muted">
        Les thèmes de chaque niveau, dans l’ordre où les traiter, sont proposés aux professeurs quand ils donnent des défis à une classe.
        Dans un thème, les défis sont rangés par étape ; un défi en brouillon n’est montré aux professeurs qu’une fois publié.
        Modifier une progression ne touche aucune classe.
      </p>
      <nav aria-label="Niveaux" className="flex gap-2">
        {LEVELS.map((l) => (
          <Link key={l} href={`/admin/parcours?niveau=${l}`} aria-current={l === level ? 'page' : undefined}
            className={`rounded-xl px-4 py-2 text-lg font-semibold ${l === level ? 'bg-primary text-white' : 'bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-surface'}`}>
            {levelLabel(l)}
          </Link>
        ))}
      </nav>
      {/* Clé = niveau seulement : pas de remontage à chaque déplacement (le focus clavier est conservé). */}
      <ProgressionEditor key={level} level={level} themes={themes} stock={stock} />
    </div>
  )
}
