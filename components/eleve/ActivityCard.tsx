import Image from 'next/image'
import Link from 'next/link'
import { BookOpenCheck, Blocks, ChevronRight } from 'lucide-react'
import type { StudentDefi } from '@/lib/db/assignments'
import type { ProgressStatus } from '@/lib/db/schema'
import { DueChip } from './DueChip'
import { StatusBadge } from './StatusBadge'

/** Ce que l'élève peut faire sur le défi, et l'encre du bouton (rouge : corriger, bleu plein : continuer). */
const ACTION: Record<ProgressStatus, { label: string; cls: string }> = {
  not_started: { label: 'Commencer', cls: 'bg-panel text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]' },
  in_progress: { label: 'Continuer', cls: 'bg-primary text-white' },
  submitted: { label: 'Voir', cls: 'bg-panel text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]' },
  validated: { label: 'Revoir', cls: 'bg-panel text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]' },
  almost: { label: 'Corriger', cls: 'bg-encre text-white' },
  needs_work: { label: 'Corriger', cls: 'bg-encre text-white' },
  not_submitted: { label: 'Voir', cls: 'bg-panel text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]' },
}

/** Une ligne de la liste « Mes défis » : n°, vignette, titre et échéance, statut, action. */
export function ActivityCard({ item, status, nowMs, highlighted = false }: { item: StudentDefi; status: ProgressStatus; nowMs: number; highlighted?: boolean }) {
  const action = ACTION[status]
  return (
    <div className={`flex items-stretch border-b border-line last:border-b-0 ${highlighted ? 'bg-surligne/18 shadow-[inset_4px_0_0_var(--color-surligne)]' : ''}`}>
      <Link href={`/defis/${item.activityId}`}
        className="grid min-w-0 flex-1 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-3 transition hover:bg-primary-wash/50 md:grid-cols-[40px_100px_minmax(0,1fr)_auto_auto] md:gap-x-4 md:px-5">
        <span aria-hidden className="hidden size-10 place-items-center rounded-full bg-primary-wash text-[17px] font-semibold text-primary-ink md:grid">
          {item.section === 'mini-projet' ? 'MP' : item.number}
        </span>
        <span className="relative row-span-2 aspect-[4/3] overflow-hidden rounded-lg bg-thumb shadow-[inset_0_0_0_1px_var(--color-line)] md:row-span-1">
          {item.thumbnail
            ? <Image src={item.thumbnail} alt="" fill sizes="100px" className="object-contain p-1" />
            : <Blocks className="absolute inset-0 m-auto size-8 text-primary-soft" aria-hidden />}
        </span>
        <div className="min-w-0">
          <span className="block text-[13px] text-muted">{item.section === 'mini-projet' ? 'Mini-projet' : `Défi n°${item.number}`} </span>
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug md:truncate md:text-[17px]">{item.title}</h3>
          {item.dueAt && status !== 'validated'
            ? <DueChip dueAt={item.dueAt} nowMs={nowMs} />
            : <span className="block text-sm text-muted">Pas de date limite</span>}
        </div>
        <span className="col-start-2 row-start-2 mt-1.5 md:col-start-auto md:row-start-auto md:mt-0"><StatusBadge status={status} /></span>
        <span aria-hidden className={`hidden min-w-[112px] justify-center rounded-[10px] px-3.5 py-2 text-[15px] font-semibold md:inline-flex ${action.cls}`}>{action.label}</span>
        <ChevronRight aria-hidden className="col-start-3 row-span-2 row-start-1 size-5 text-muted md:hidden" />
      </Link>
      {/* Corrigé partagé par le professeur : lien à côté de la ligne du défi (pas sur téléphone : consultation seule). */}
      {item.solutionShared && (
        <Link href={`/defis/${item.activityId}/corrige`} aria-label={`Corrigé du défi n°${item.number}`}
          className="hidden shrink-0 items-center gap-2 border-l border-line px-4 font-semibold text-primary-ink hover:bg-primary-wash/50 md:flex">
          <BookOpenCheck className="size-5" aria-hidden /><span className="hidden lg:inline">Corrigé</span>
        </Link>
      )}
    </div>
  )
}
