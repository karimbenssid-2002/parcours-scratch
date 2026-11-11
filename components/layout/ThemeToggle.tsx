'use client'
import { useState, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { THEME_COOKIE, type Theme } from '@/lib/ui/theme'

const QUERY = '(prefers-color-scheme: dark)'
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** Bascule clair/sombre de l'espace élève ; le choix est gardé un an dans un cookie lu par le serveur. */
export function ThemeToggle({ initial, className = '' }: { initial?: Theme; className?: string }) {
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
  const [chosen, setChosen] = useState(initial)
  const dark = (chosen ?? (systemDark ? 'dark' : 'light')) === 'dark'
  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark'
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    document.querySelector('[data-area="eleve"]')?.setAttribute('data-theme', next)
    setChosen(next)
  }
  const label = dark ? 'Mode clair' : 'Mode sombre'
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={className}>
      {dark ? <Sun className="size-5 text-sc-events" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}
