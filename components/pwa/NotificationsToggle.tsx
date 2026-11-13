'use client'
import { useEffect, useState } from 'react'
import { isStandalone } from '@/lib/pwa/install'
import { appRegistration } from '@/lib/pwa/registration'
import { chromeIntentUrl, keyToBytes, needsChromeFallback, sameKey, toggleState, type ToggleState } from '@/lib/pwa/notifications'

const COPY = {
  admin: {
    denied: 'Notifications bloquées : autorisez-les dans les réglages du téléphone.',
    error: 'Impossible de modifier les notifications pour le moment. Réessayez.',
    fallback: 'Sur ce téléphone, l’activation se fait depuis Chrome :',
    back: 'C’est fait : vous pouvez revenir dans l’appli.',
  },
  eleve: {
    denied: 'Notifications bloquées : autorise-les dans les réglages du téléphone.',
    error: 'Impossible de modifier les notifications pour le moment. Réessaie.',
    fallback: 'Sur ce téléphone, l’activation se fait depuis Chrome :',
    back: 'C’est fait : tu peux revenir dans l’appli.',
  },
} as const

type Snapshot = { supported: boolean; permission: NotificationPermission; subscribed: boolean; serverKnows: boolean }

/** État réel : abonnement du navigateur (avec la clé actuelle) et, s'il existe, confirmation du serveur pour ce compte. */
async function readSnapshot(app: 'admin' | 'eleve', publicKey: string, endpoint: string): Promise<Snapshot | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null
  const registration = await appRegistration(app)
  const sub = await registration.pushManager.getSubscription()
  const subscribed = sub !== null && sameKey(sub.options.applicationServerKey, keyToBytes(publicKey))
  let serverKnows = false
  if (sub && subscribed) {
    try {
      const res = await fetch(`${endpoint}&endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: 'no-store' })
      serverKnows = res.ok && ((await res.json()) as { subscribed?: boolean }).subscribed === true
    } catch { /* serveur injoignable : on propose d'activer */ }
  }
  return { supported: true, permission: Notification.permission, subscribed, serverKnows }
}

/** Code court pour le diagnostic : étape + nom de l'erreur (ex. « abonnement · AbortError », « serveur · HTTP 400 »). */
function errorCode(step: string, error: unknown): string {
  const detail = error instanceof DOMException ? `${error.name} ${error.message}` : error instanceof Error ? error.message : 'inconnue'
  return `${step} · ${detail}`.slice(0, 120)
}

/** Active ou coupe les notifications de cet appareil. N'apparaît que dans l'appli installée (écran d'accueil) et si le
 *  navigateur sait recevoir des notifications ; la permission n'est demandée qu'au toucher du bouton. */
export function NotificationsToggle({ app, publicKey }: { app: 'admin' | 'eleve'; publicKey: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [viaChrome, setViaChrome] = useState(false) // appli installée Android qui ne peut pas s'abonner elle-même
  const [fromApp, setFromApp] = useState(false) // onglet Chrome ouvert depuis l'appli pour activer
  const endpoint = `/api/notifications/abonnement?app=${app}`

  useEffect(() => {
    // ?notifs=chrome (lien « Ouvrir dans Chrome » de l'appli) ou ?notifs=test : bouton aussi dans un onglet ordinaire.
    const param = new URLSearchParams(location.search).get('notifs')
    if (!isStandalone() && param !== 'chrome' && param !== 'test') return
    const opened = param === 'chrome'
    let cancelled = false
    const refresh = () => {
      void readSnapshot(app, publicKey, endpoint).then((s) => { if (!cancelled) { setStandalone(true); setFromApp(opened); setSnap(s) } }).catch(() => {})
    }
    refresh()
    // Retour dans l'appli : la permission ou l'abonnement ont pu changer (réglages du téléphone, autre session).
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [app, publicKey, endpoint])

  const state: ToggleState = snap ? toggleState({ standalone, ...snap }) : 'hidden'
  if (state === 'hidden') return null

  async function enable() {
    setBusy(true); setFailed(null)
    let step = 'permission' // étape en cours, affichée en petit avec l'erreur pour le diagnostic
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setSnap((s) => s && { ...s, permission }); return }
      step = 'sw'
      const registration = await appRegistration(app)
      const key = keyToBytes(publicKey)
      step = 'abonnement'
      let subscription = await registration.pushManager.getSubscription()
      // Abonnement fait avec une autre clé VAPID : inutilisable, on le remplace.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      step = 'serveur'
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription) })
      if (!res.ok) { await subscription.unsubscribe().catch(() => {}); throw new Error(`HTTP ${res.status}`) }
      setSnap({ supported: true, permission, subscribed: true, serverKnows: true })
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : null
      if (needsChromeFallback({ step, errorName, standalone: isStandalone(), userAgent: navigator.userAgent })) setViaChrome(true)
      else setFailed(errorCode(step, error))
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true); setFailed(null)
    try {
      const registration = await appRegistration(app)
      const subscription = await registration.pushManager.getSubscription()
      await subscription?.unsubscribe()
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSnap((s) => s && { ...s, subscribed: false, serverKnows: false })
    } catch (error) {
      setFailed(errorCode('desabonnement', error))
    } finally {
      setBusy(false)
    }
  }

  const link = 'font-semibold text-primary-ink underline underline-offset-2 disabled:opacity-60'
  return (
    <div className="mt-1 text-sm">
      {state === 'offer' && !viaChrome && (
        <button type="button" onClick={enable} disabled={busy} className={link}>Activer les notifications</button>
      )}
      {state === 'offer' && viaChrome && (
        <p className="text-muted">{COPY[app].fallback} <a href={chromeIntentUrl(location.host, location.pathname)} className={link}>Ouvrir dans Chrome</a></p>
      )}
      {state === 'on' && (
        <p className="text-muted">Notifications activées · <button type="button" onClick={disable} disabled={busy} className={link}>Désactiver</button></p>
      )}
      {state === 'on' && fromApp && <p className="mt-1 font-semibold text-st-good">{COPY[app].back}</p>}
      {state === 'denied' && <p className="text-muted">{COPY[app].denied}</p>}
      {failed && (
        <p role="alert" className="mt-1 text-st-bad">
          {COPY[app].error} <span className="block text-xs opacity-80">Code : {failed}</span>
        </p>
      )}
    </div>
  )
}
