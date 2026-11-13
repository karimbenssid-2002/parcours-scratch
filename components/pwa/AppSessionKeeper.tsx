'use client'
import { useEffect } from 'react'
import { isStandalone } from '@/lib/pwa/install'
import { APP_IDLE_MS, appModeCookie, type AppArea } from '@/lib/auth/app-idle'

const BEAT_MS = 60_000

/** Appli installée : signale au serveur qu'elle est à l'écran (chaque minute, et à la fermeture). Revenue au premier
 *  plan après plus de 5 minutes en arrière-plan, la page est rechargée : le serveur ferme alors la session. */
export function AppSessionKeeper({ app }: { app: AppArea }) {
  useEffect(() => {
    if (!isStandalone()) return
    const secure = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${appModeCookie(app)}=1; path=/; max-age=31536000; samesite=lax${secure}`
    const url = `/api/session/presence?app=${app}`
    const beat = () => { void fetch(url, { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {}) }
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        beat() // dernier passage = moment de la fermeture
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > APP_IDLE_MS) { location.reload(); return }
        hiddenAt = null
        beat()
      }
    }
    beat()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') beat() }, BEAT_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [app])
  return null
}
