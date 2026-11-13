import 'server-only'
import type { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { deleteSubscription, deleteSubscriptionById, deleteSubscriptionIfNotOwnedBy, subscriptionBelongsTo, type PushOwner } from '@/lib/db/push-subscriptions'

export const deviceCookie = (app: 'eleve' | 'admin') => `push_device_${app}`

/** À la déconnexion : supprime l'abonnement de cet appareil (ligne nommée par le cookie). Session valide : seulement
 *  s'il appartient à ce compte. Session absente, invalide ou expirée : le cookie d'appareil (aléatoire, httpOnly, posé
 *  par le serveur) suffit. Les erreurs sont ignorées : la déconnexion a toujours lieu. */
export async function dropDeviceSubscription(deviceId: string | undefined, owner: PushOwner | null): Promise<void> {
  if (!deviceId) return
  try {
    if (owner) await deleteSubscription(getDb(), owner, deviceId)
    else await deleteSubscriptionById(getDb(), deviceId)
  } catch {
    /* abonnement orphelin : retiré à l'envoi suivant (410/404) */
  }
}

/** Connexion réussie : si l'appareil porte l'abonnement d'un autre compte, cette ligne est supprimée et le cookie effacé.
 *  Ne bloque jamais la connexion. */
export async function dropForeignDeviceSubscription(request: Request, res: NextResponse, app: 'eleve' | 'admin', owner: PushOwner): Promise<void> {
  try {
    const name = deviceCookie(app)
    let id: string | null = null
    for (const part of (request.headers.get('cookie') ?? '').split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === name) id = v.join('=') || null
    }
    if (!id) return
    const db = getDb()
    if (await subscriptionBelongsTo(db, owner, id)) return // le même compte se reconnecte : l'appareil reste abonné
    await deleteSubscriptionIfNotOwnedBy(db, owner, id)
    res.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  } catch {
    /* sans effet sur la connexion */
  }
}
