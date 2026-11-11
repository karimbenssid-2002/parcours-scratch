'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type Tab = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; match: (path: string) => boolean }

/** Barre d'onglets en bas de l'écran, sur téléphone uniquement (cachée à partir de 768 px). */
export function TabBar({ tabs, label }: { tabs: Tab[]; label: string }) {
  const path = usePathname()
  return (
    <nav aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-line bg-panel px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_24px_-18px_rgb(20_27_51/.5)] md:hidden">
      {tabs.map(({ href, label: text, icon: Icon, badge, match }) => {
        const on = match(path)
        return (
          <Link key={href} href={href} aria-current={on ? 'page' : undefined}
            aria-label={badge ? `${text}, ${badge} en attente` : text}
            className={`relative grid justify-items-center gap-0.5 rounded-xl py-1 text-[11.5px] ${on ? 'font-semibold text-primary-ink' : 'font-medium text-muted'}`}>
            <span className={`grid h-[30px] w-14 place-items-center rounded-full ${on ? 'bg-primary-wash' : ''}`}><Icon className="size-5" aria-hidden /></span>
            {text}
            {badge ? <span aria-hidden className="absolute left-[calc(50%+8px)] top-0 rounded-full bg-encre px-1.5 text-[10.5px] font-semibold leading-[17px] text-white">{badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
