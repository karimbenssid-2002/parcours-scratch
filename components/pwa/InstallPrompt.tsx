'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { EllipsisVertical, Share, SquarePlus, X } from 'lucide-react'
import { detectPlatform, isStandalone, later as laterThisTime, markInstalled, shouldOffer, type Platform } from '@/lib/pwa/install'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const noSubscribe = () => () => {}
// L'écran, le navigateur et le choix « plus tard » ne sont connus que du navigateur (rien côté serveur).
const offeredPlatform = (): Platform | null => {
  const touch = window.matchMedia('(pointer: coarse)').matches
  return touch && !isStandalone() && shouldOffer(localStorage, sessionStorage, Date.now()) ? detectPlatform(navigator.userAgent, navigator.maxTouchPoints) : null
}

// Android : délai laissé au navigateur pour signaler qu'il sait installer directement, avant de montrer les étapes.
const DIRECT_INSTALL_WAIT_MS = 3000

/** Propose à l'élève d'installer la web app sur son téléphone ou sa tablette.
 *  Android (Chrome, Edge, Samsung Internet…) : bouton « Installer » qui lance directement l'installation
 *  (le navigateur n'affiche que sa confirmation).
 *  iPhone / iPad, et navigateurs sans installation directe : les gestes à faire, illustrés, affichés d'emblée. */
const COPY = {
  eleve: {
    title: 'Installe l’appli Parcours Scratch',
    pitch: 'Tes défis et les retours de ton prof, en un toucher depuis l’écran d’accueil.',
    icon: '/icons/icon-192.png',
  },
  prof: {
    title: 'Installez l’appli Parcours Scratch',
    pitch: 'Défis à valider, suivi des classes et correction automatique, en un toucher depuis l’écran d’accueil.',
    icon: '/icons/prof-192.png',
  },
} as const

export function InstallPrompt({ audience = 'eleve' }: { audience?: 'eleve' | 'prof' }) {
  const copy = COPY[audience]
  const tu = audience === 'eleve'
  const offered = useSyncExternalStore(noSubscribe, offeredPlatform, () => null)
  const [closed, setClosed] = useState(false)
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {})
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent) }
    const onInstalled = () => { markInstalled(localStorage, Date.now()); setClosed(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const timer = setTimeout(() => setWaited(true), DIRECT_INSTALL_WAIT_MS)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const platform = closed ? null : offered
  if (!platform) return null
  const direct = platform === 'android' && deferred !== null
  // Android : rien tant que le navigateur n'a pas dit s'il sait installer directement (pas de bouton qui mène à un menu).
  if (platform === 'android' && !direct && !waited) return null

  // « Plus tard » : masquée jusqu'à la prochaine ouverture de l'appli. « C'est fait » (iPhone) : plus proposée.
  const later = () => { laterThisTime(sessionStorage); setClosed(true) }
  const done = () => { markInstalled(localStorage, Date.now()); setClosed(true) }
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setClosed(true)
  }

  return (
    <section aria-labelledby="installer" className="glass mx-auto mb-5 w-full max-w-7xl overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <Image src={copy.icon} alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]" />
        <div className="min-w-0 flex-1">
          <h2 id="installer" className="font-semibold leading-snug">{copy.title}</h2>
          <p className="text-sm text-muted">{copy.pitch}</p>
        </div>
        <button type="button" onClick={later} aria-label="Plus tard" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-tile-muted">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {direct ? (
        <div className="flex gap-2 px-3.5 pb-3.5">
          <button type="button" onClick={install} className="min-h-11 flex-1 cursor-pointer rounded-[10px] bg-primary px-4 font-semibold text-white hover:bg-primary-2">
            Installer
          </button>
          <button type="button" onClick={later} className="min-h-11 cursor-pointer rounded-[10px] px-4 font-semibold text-primary-ink hover:bg-primary-wash">Plus tard</button>
        </div>
      ) : (
        <ol className="space-y-2 border-t border-line px-3.5 py-3 text-[15px]">
          {platform === 'ios' ? (
            <>
              <Step n={1}>{tu ? 'Touche' : 'Touchez'} <Key><Share className="size-4" aria-hidden />Partager</Key> {' '}en bas de Safari (ou à côté de l’adresse).</Step>
              <Step n={2}>{tu ? 'Fais défiler puis touche' : 'Faites défiler puis touchez'} <Key><SquarePlus className="size-4" aria-hidden />Sur l’écran d’accueil</Key>.</Step>
              <Step n={3}>{tu ? 'Touche' : 'Touchez'} <Key>Ajouter</Key> en haut à droite. L’appli apparaît sur {tu ? 'ton' : 'votre'} écran d’accueil.</Step>
            </>
          ) : (
            <>
              <Step n={1}>{tu ? 'Touche' : 'Touchez'} le menu <Key><EllipsisVertical className="size-4" aria-hidden />du navigateur</Key> en haut à droite.</Step>
              <Step n={2}>{tu ? 'Choisis' : 'Choisissez'} <Key>Installer l’application</Key> ou <Key>Ajouter à l’écran d’accueil</Key>.</Step>
              <Step n={3}>{tu ? 'Confirme' : 'Confirmez'} avec <Key>Installer</Key>. L’appli apparaît sur {tu ? 'ton' : 'votre'} écran d’accueil.</Step>
            </>
          )}
          <li className="flex gap-2 pt-1">
            <button type="button" onClick={done} className="min-h-10 flex-1 cursor-pointer rounded-[10px] bg-primary-wash font-semibold text-primary-ink hover:bg-primary-wash/70">C’est fait</button>
            <button type="button" onClick={later} className="min-h-10 flex-1 cursor-pointer rounded-[10px] font-semibold text-primary-ink hover:bg-primary-wash">Plus tard</button>
          </li>
        </ol>
      )}
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-wash text-sm font-semibold text-primary-ink">{n}</span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-tile-muted px-1.5 py-0.5 align-middle text-sm font-semibold">{children}</span>
}
