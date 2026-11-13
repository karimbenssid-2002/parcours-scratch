import { and, desc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import type { DB } from './client'
import { pushSubscriptions } from './schema'

export type PushOwner = { kind: 'student' | 'teacher'; id: string }
export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }
export type StoredSubscription = typeof pushSubscriptions.$inferSelect

/** Appareils gardés par compte : au-delà, les plus anciens abonnements sont supprimés. */
export const MAX_SUBSCRIPTIONS_PER_OWNER = 10

const ownerIs = (o: PushOwner) => and(eq(pushSubscriptions.ownerKind, o.kind), eq(pushSubscriptions.ownerId, o.id))

/** Enregistre (ou met à jour les clés de) l'abonnement d'un appareil pour ce compte ; renvoie son identifiant. */
export async function saveSubscription(db: DB, owner: PushOwner, sub: PushSubscriptionInput): Promise<string> {
  // Un appareil partagé : le point d'accès ne reste lié qu'au dernier compte (de même type) qui s'y abonne.
  const row = await db.transaction(async (tx) => {
    await tx.delete(pushSubscriptions).where(and(
      eq(pushSubscriptions.endpoint, sub.endpoint), eq(pushSubscriptions.ownerKind, owner.kind), ne(pushSubscriptions.ownerId, owner.id)))
    const [r] = await tx.insert(pushSubscriptions)
      .values({ ownerKind: owner.kind, ownerId: owner.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({
        target: [pushSubscriptions.ownerKind, pushSubscriptions.ownerId, pushSubscriptions.endpoint],
        set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      })
      .returning({ id: pushSubscriptions.id })
    return r
  })
  const keep = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(ownerIs(owner))
    .orderBy(desc(pushSubscriptions.createdAt)).limit(MAX_SUBSCRIPTIONS_PER_OWNER)
  const keepIds = keep.map((k) => k.id)
  if (!keepIds.includes(row.id)) { keepIds.pop(); keepIds.push(row.id) } // le nouvel abonnement reste toujours
  await db.delete(pushSubscriptions).where(and(ownerIs(owner), notInArray(pushSubscriptions.id, keepIds)))
  return row.id
}

/** Cette ligne existe-t-elle pour ce compte, avec ce point d'accès ? (jamais d'autre information sur les lignes) */
export async function subscriptionMatches(db: DB, owner: PushOwner, id: string, endpoint: string): Promise<boolean> {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), ownerIs(owner), eq(pushSubscriptions.endpoint, endpoint))).limit(1)
  return rows.length > 0
}

/** Supprime un abonnement, seulement s'il appartient à ce compte. */
export async function deleteSubscription(db: DB, owner: PushOwner, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, id), ownerIs(owner)))
}

/** Abonnements de ces comptes (au plus 10 récents par compte), en une requête. */
export async function listSubscriptionsFor(db: DB, kind: PushOwner['kind'], ownerIds: string[]): Promise<StoredSubscription[]> {
  if (ownerIds.length === 0) return []
  const rows = await db.select().from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.ownerKind, kind), inArray(pushSubscriptions.ownerId, ownerIds)))
    .orderBy(desc(pushSubscriptions.createdAt))
  const seen = new Map<string, number>()
  return rows.filter((r) => {
    const n = (seen.get(r.ownerId) ?? 0) + 1
    seen.set(r.ownerId, n)
    return n <= MAX_SUBSCRIPTIONS_PER_OWNER
  })
}

/** Cette ligne appartient-elle à ce compte ? */
export async function subscriptionBelongsTo(db: DB, owner: PushOwner, id: string): Promise<boolean> {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(eq(pushSubscriptions.id, id), ownerIs(owner))).limit(1)
  return rows.length > 0
}

/** Supprime la ligne si elle appartient à un autre compte du même type (appareil laissé par un autre compte) ; jamais celle d'un autre type. */
export async function deleteSubscriptionIfNotOwnedBy(db: DB, owner: PushOwner, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.id, id), eq(pushSubscriptions.ownerKind, owner.kind), ne(pushSubscriptions.ownerId, owner.id)))
}

export async function deleteSubscriptionById(db: DB, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
}
