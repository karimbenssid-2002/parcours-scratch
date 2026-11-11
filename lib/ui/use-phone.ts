'use client'
import { useSyncExternalStore } from 'react'

/** Même seuil que le préfixe `md:` de Tailwind : en dessous de 768 px, on est sur téléphone. */
export const PHONE_QUERY = '(max-width: 767px)'

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE_QUERY)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** Vrai sur téléphone. Côté serveur (et au premier rendu) : faux. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}
