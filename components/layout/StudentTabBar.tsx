'use client'
import { Clapperboard, LayoutGrid, MessageSquare, UserRound } from 'lucide-react'
import { TabBar } from './TabBar'

/** Onglets de l'élève sur téléphone : consultation seulement (les défis se codent sur ordinateur). */
export function StudentTabBar() {
  return (
    <TabBar label="Onglets élève" tabs={[
      { href: '/', label: 'Mes défis', icon: LayoutGrid, match: (p) => p === '/' || p.startsWith('/defis') },
      { href: '/retours', label: 'Retours', icon: MessageSquare, match: (p) => p.startsWith('/retours') },
      { href: '/tutos', label: 'Tutos', icon: Clapperboard, match: (p) => p.startsWith('/tutos') },
      { href: '/profil', label: 'Profil', icon: UserRound, match: (p) => p.startsWith('/profil') },
    ]} />
  )
}
