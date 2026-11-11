'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Modulo } from './Modulo'
import { Bot, Clapperboard, ClipboardCheck, GraduationCap, Inbox, LayoutDashboard, ListOrdered, LogOut, Puzzle, School, Users } from 'lucide-react'

type Item = { href: string; label: string; short: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; badge?: number }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

/** Barre latérale fine à l'encre bleue, à partir de 768 px (sur téléphone : AdminMobileNav). */
export function AdminNav({ role, name, pendingRequests, pendingReviews }: { role: 'admin' | 'prof'; name: string; pendingRequests: number; pendingReviews: number }) {
  const path = usePathname()
  const items: Item[] = [
    { href: '/admin', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
    { href: '/admin/classes', label: 'Mes classes', short: 'Classes', icon: School },
    { href: '/admin/a-valider', label: 'À valider', short: 'À valider', icon: ClipboardCheck, badge: pendingReviews },
    { href: '/admin/tutos', label: 'Tutos Scratch', short: 'Tutos', icon: Clapperboard },
    { href: '/admin/activites', label: 'Activités', short: 'Activités', icon: Puzzle, adminOnly: true },
    { href: '/admin/parcours', label: 'Progressions', short: 'Progressions', icon: ListOrdered, adminOnly: true },
    { href: '/admin/eleves', label: 'Élèves', short: 'Élèves', icon: GraduationCap, adminOnly: true },
    { href: '/admin/correction', label: 'Correction auto.', short: 'Correction', icon: Bot, adminOnly: true },
    { href: '/admin/demandes', label: 'Demandes', short: 'Demandes', icon: Inbox, adminOnly: true, badge: pendingRequests },
    { href: '/admin/enseignants', label: 'Enseignants', short: 'Profs', icon: Users, adminOnly: true },
  ]
  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href))
  const cell = 'relative flex shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11.5px] font-medium leading-tight text-[#cfd9f6] transition hover:bg-white/10 hover:text-white w-[68px]'
  return (
    <nav aria-label="Navigation principale"
      className="sticky top-0 z-20 hidden h-dvh w-[92px] shrink-0 flex-col items-center gap-1 overflow-y-auto bg-nav pb-16 pt-4 text-white md:flex">
      <Link href="/admin" aria-label="Parcours Scratch, accueil" className="mb-3 grid size-12 shrink-0 place-items-center rounded-[14px] bg-white p-0.5">
        <Modulo size={44} />
      </Link>
      {items.filter((i) => !i.adminOnly || role === 'admin').map(({ href, label, short, icon: Icon, badge }) => {
        const active = isActive(href)
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            aria-label={badge ? `${label}, ${badge} en attente` : label} title={label}
            className={`${cell} min-w-[64px] ${active ? 'bg-primary-2 font-semibold text-white!' : ''}`}>
            <Icon className="size-5" aria-hidden />
            <span>{short}</span>
            {badge ? <span aria-hidden className="absolute right-1.5 top-1 rounded-full bg-encre px-1.5 text-[11px] font-semibold text-white">{badge}</span> : null}
          </Link>
        )
      })}
      <span className="flex-1" />
      <span title={`${name} · ${role === 'admin' ? 'Administrateur' : 'Enseignant'}`}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold">
        {initials(name)}<span className="sr-only">{name}, {role === 'admin' ? 'administrateur' : 'enseignant'}</span>
      </span>
      <a href="/admin/deconnexion" aria-label="Se déconnecter" title="Se déconnecter" className={`${cell} min-w-[64px]`}>
        <LogOut className="size-5" aria-hidden /><span>Sortir</span>
      </a>
    </nav>
  )
}
