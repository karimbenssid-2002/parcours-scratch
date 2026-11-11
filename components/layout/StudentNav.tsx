'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clapperboard, LayoutGrid, LogOut, UserRound } from 'lucide-react'
import type { Theme } from '@/lib/ui/theme'
import { Modulo } from './Modulo'
import { ThemeToggle } from './ThemeToggle'

const tab = 'flex items-center gap-2 rounded-[10px] px-3 py-2 font-medium text-[#cfd9f6] transition hover:bg-white/10 hover:text-white'
const tabOn = 'bg-primary-2 font-semibold text-white!'
const iconBtn = 'grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-white/12 text-white transition hover:bg-white/20'

/** Barre de navigation en haut, à l'encre bleue (sur téléphone : titre et thème ; les onglets sont en bas). */
export function StudentNav({ firstName, theme }: { firstName: string; theme?: Theme }) {
  const path = usePathname()
  const onDefis = path === '/' || path.startsWith('/defis')
  const onProfile = path.startsWith('/profil')
  const onTutos = path.startsWith('/tutos')
  return (
    <nav aria-label="Navigation élève" className="sticky top-0 z-20 bg-nav text-white shadow-[0_6px_18px_-12px_rgb(20_27_51/.6)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 md:px-8">
        <Link href="/" aria-label="Parcours Scratch, accueil" className="mr-3 flex items-center gap-2.5 text-lg font-semibold">
          <span className="grid size-11 place-items-center rounded-xl bg-white p-0.5"><Modulo size={40} /></span>
          <span className="hidden lg:inline">Parcours Scratch</span>
        </Link>
        <span className="text-lg font-semibold md:hidden">Parcours Scratch</span>
        <Link href="/" aria-current={onDefis ? 'page' : undefined} className={`${tab} ${onDefis ? tabOn : ''} hidden md:flex`}>
          <LayoutGrid className="size-[18px]" aria-hidden /><span>Mes défis</span>
        </Link>
        <Link href="/tutos" aria-current={onTutos ? 'page' : undefined} className={`${tab} ${onTutos ? tabOn : ''} hidden md:flex`}>
          <Clapperboard className="size-[18px]" aria-hidden /><span>Tutos Scratch</span>
        </Link>
        <Link href="/profil" aria-label={`Mon profil (${firstName})`} aria-current={onProfile ? 'page' : undefined} className={`${tab} ${onProfile ? tabOn : ''} hidden md:flex`}>
          <UserRound className="size-[18px]" aria-hidden /><span>Mon profil</span>
        </Link>
        <span className="flex-1" />
        <span className="hidden font-medium text-[#cfd9f6] md:inline">{firstName}</span>
        <ThemeToggle initial={theme} className={`${iconBtn} ml-2`} />
        <a href="/deconnexion" aria-label="Déconnexion" title="Déconnexion" className={`${iconBtn} hidden md:grid`}>
          <LogOut className="size-[18px]" aria-hidden />
        </a>
        <span className="ml-2 hidden rounded-[10px] bg-white px-3 py-1.5 md:block">
          <Image src="/brand/lycee-malraux.png" alt="Lycée Français International André-Malraux" width={87} height={32} style={{ height: 32, width: 'auto' }} />
        </span>
      </div>
    </nav>
  )
}
