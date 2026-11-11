'use client'
import Link from 'next/link'
import { ClipboardCheck, LayoutDashboard, Menu, School } from 'lucide-react'
import { Modulo } from './Modulo'
import { TabBar } from './TabBar'

/** Sur téléphone : barre de titre en haut et onglets en bas ; la barre latérale est cachée. */
export function AdminMobileNav({ pendingReviews, pendingRequests }: { pendingReviews: number; pendingRequests: number }) {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 bg-nav px-3.5 text-white md:hidden">
        <Link href="/admin" aria-label="Parcours Scratch, accueil" className="grid size-10 place-items-center rounded-xl bg-white p-0.5"><Modulo size={36} /></Link>
        <span className="text-lg font-semibold">Parcours Scratch</span>
      </header>
      <TabBar label="Onglets enseignant" tabs={[
        { href: '/admin', label: 'Accueil', icon: LayoutDashboard, match: (p) => p === '/admin' },
        { href: '/admin/a-valider', label: 'À valider', icon: ClipboardCheck, badge: pendingReviews, match: (p) => p.startsWith('/admin/a-valider') || p.startsWith('/admin/revue') },
        { href: '/admin/classes', label: 'Classes', icon: School, match: (p) => p.startsWith('/admin/classes') || p.startsWith('/admin/suivi') },
        { href: '/admin/plus', label: 'Plus', icon: Menu, badge: pendingRequests,
          match: (p) => ['/admin/plus', '/admin/tutos', '/admin/activites', '/admin/parcours', '/admin/eleves', '/admin/correction', '/admin/demandes', '/admin/enseignants', '/admin/apercu'].some((h) => p.startsWith(h)) },
      ]} />
    </>
  )
}
