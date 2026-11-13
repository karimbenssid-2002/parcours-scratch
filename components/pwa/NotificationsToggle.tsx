'use client'
import { useEffect, useState } from 'react'
import { isStandalone } from '@/lib/pwa/install'
import { keyToBytes, sameKey, toggleState, type ToggleState } from '@/lib/pwa/notifications'

const COPY = {
  admin: {
    denied: 'Notifications bloquées : autorisez-les dans les réglages du téléphone.',
    error: 'Impossible de modifier les notifications pour le moment. Réessayez.',
  },
  eleve: {
    denied: 'Notifications bloquées : autorise-les dans les réglages du téléphone.',
    error: 'Impossible de modifier les notifications pour le moment. Réessaie.',
  },
} as const

type Snapshot = { supported: boolean; permission: NotificationPermission; subscribed: boolean; serverKnows: boolean }

/** État réel : abonnement du navigateur (avec la clé actuelle) et, s'il existe, confirmation du serveur pour ce compte. */
async function readSnapshot(publicKey: string, endpoint: string): Promise<Snapshot | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null
  const registration = await navigator.serviceWorker.ready
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

/** Active ou coupe les notifications de cet appareil. N'apparaît que dans l'appli installée (écran d'accueil) et si le
 *  navigateur sait recevoir des notifications ; la permission n'est demandée qu'au toucher du bouton. */
export function NotificationsToggle({ app, publicKey }: { app: 'admin' | 'eleve'; publicKey: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const endpoint = `/api/notifications/abonnement?app=${app}`

  useEffect(() => {
    if (!isStandalone()) return
    let cancelled = false
    const refresh = () => {
      void readSnapshot(publicKey, endpoint).then((s) => { if (!cancelled) { setStandalone(true); setSnap(s) } }).catch(() => {})
    }
    refresh()
    // Retour dans l'appli : la permission ou l'abonnement ont pu changer (réglages du téléphone, autre session).
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [publicKey, endpoint])

  const state: ToggleState = snap ? toggleState({ standalone, ...snap }) : 'hidden'
  if (state === 'hidden') return null

  async function enable() {
    setBusy(true); setFailed(false)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setSnap((s) => s && { ...s, permission }); return }
      const registration = await navigator.serviceWorker.ready
      const key = keyToBytes(publicKey)
      let subscription = await registration.pushManager.getSubscription()
      // Abonnement fait avec une autre clé VAPID : inutilisable, on le remplace.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription) })
      if (!res.ok) { await subscription.unsubscribe().catch(() => {}); throw new Error('abonnement refusé') }
      setSnap({ supported: true, permission, subscribed: true, serverKnows: true })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true); setFailed(false)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      await subscription?.unsubscribe()
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) throw new Error('désabonnement refusé')
      setSnap((s) => s && { ...s, subscribed: false, serverKnows: false })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const link = 'font-semibold text-primary-ink underline underline-offset-2 disabled:opacity-60'
  return (
    <div className="mt-1 text-sm">
      {state === 'offer' && (
        <button type="button" onClick={enable} disabled={busy} className={link}>Activer les notifications</button>
      )}
      {state === 'on' && (
        <p className="text-muted">Notifications activées · <button type="button" onClick={disable} disabled={busy} className={link}>Désactiver</button></p>
      )}
      {state === 'denied' && <p className="text-muted">{COPY[app].denied}</p>}
      {failed && <p role="alert" className="mt-1 text-st-bad">{COPY[app].error}</p>}
    </div>
  )
}
