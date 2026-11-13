import Image from 'next/image'
import Link from 'next/link'
import { Bot, ChevronRight, Clapperboard, GraduationCap, Inbox, ListOrdered, LogOut, Puzzle, Users } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { countPendingRequests } from '@/lib/db/teacher-requests'
import { NotificationsToggle } from '@/components/pwa/NotificationsToggle'
import { pushEnabled, vapidPublicKey } from '@/lib/push/config'

export const metadata = { title: 'Plus' }

const ADMIN_LINKS = [
  { href: '/admin/activites', label: 'Activités', hint: 'Le stock de défis', icon: Puzzle },
  { href: '/admin/parcours', label: 'Progressions', hint: 'Thèmes et défis proposés aux profs', icon: ListOrdered },
  { href: '/admin/eleves', label: 'Élèves', hint: 'Comptes élèves', icon: GraduationCap },
  { href: '/admin/correction', label: 'Correction automatique', hint: 'Solutions et critères', icon: Bot },
  { href: '/admin/demandes', label: 'Demandes', hint: 'Demandes de compte enseignant', icon: Inbox, requests: true },
  { href: '/admin/enseignants', label: 'Enseignants', hint: 'Comptes enseignants', icon: Users },
]
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

/** Onglet « Plus » du téléphone : profil, écrans d'administration et déconnexion. */
export default async function MorePage() {
  const teacher = await requireTeacher()
  const pending = teacher.role === 'admin' ? await countPendingRequests(getDb()) : 0
  const name = `${teacher.firstName} ${teacher.lastName}`
  const publicKey = pushEnabled() ? vapidPublicKey() : null
  const row = 'flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-primary-wash/50'
  const tile = 'grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-wash text-primary-ink'
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">Plus</h1>
      <section className="glass flex items-center gap-3 p-4">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-primary font-semibold text-white">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm text-muted">{teacher.role === 'admin' ? 'Administrateur' : 'Enseignant'}</p>
          {publicKey && <NotificationsToggle app="admin" publicKey={publicKey} />}
        </div>
        <Image src="/brand/lycee-malraux.png" alt="Lycée Français International André-Malraux" width={81} height={30} style={{ height: 30, width: 'auto' }} />
      </section>

      <section aria-labelledby="ressources" className="space-y-2">
        <h2 id="ressources" className="text-sm font-semibold text-muted">Ressources</h2>
        <Link href="/admin/tutos" className={`glass ${row} rounded-2xl!`}>
          <span aria-hidden className={tile}><Clapperboard className="size-[18px]" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">Tutos Scratch</span><span className="block text-sm text-muted">Les vidéos d’aide, par catégorie</span></span>
          <ChevronRight className="size-[18px] text-muted" aria-hidden />
        </Link>
      </section>

      {teacher.role === 'admin' && (
        <section aria-labelledby="administration" className="space-y-2">
          <h2 id="administration" className="text-sm font-semibold text-muted">Administration</h2>
          <ul className="glass overflow-hidden">
            {ADMIN_LINKS.map(({ href, label, hint, icon: Icon, requests }) => (
              <li key={href}>
                <Link href={href} className={row}>
                  <span aria-hidden className={tile}><Icon className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
                  {requests && pending > 0 && <span className="rounded-lg bg-st-bad-bg px-2 py-0.5 text-[13px] font-semibold text-st-bad">{pending}</span>}
                  <ChevronRight className="size-[18px] text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a href="/admin/deconnexion" className={`glass ${row} rounded-2xl!`}>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-tile-muted text-ink"><LogOut className="size-[18px]" /></span>
        <span className="font-semibold">Se déconnecter</span>
      </a>
      <p className="text-center text-sm text-muted"><a href="/confidentialite" className="underline">Confidentialité</a></p>
    </div>
  )
}
