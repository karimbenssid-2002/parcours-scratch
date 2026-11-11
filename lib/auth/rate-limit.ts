import { createHash } from 'node:crypto'
import { and, count, eq, gte, lt } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { loginAttempts } from '@/lib/db/schema'

// Clé hachée : une longueur fixe quoi que l'utilisateur saisisse (nom de compte, IP).
const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')

/** Rétention de la purge globale : bien au-delà de la plus grande fenêtre utilisée (15 min), indépendante de l'appelant. */
export const RETENTION_MS = 24 * 60 * 60_000

/**
 * Enregistre une tentative et indique si la limite est dépassée.
 * Compteur en base : chaque requête peut tomber sur une instance serverless différente.
 * La tentative est insérée AVANT le comptage (elle y est incluse) : des requêtes parallèles
 * peuvent bloquer à tort, jamais laisser passer au-delà de `max`. Une tentative refusée est supprimée aussitôt :
 * le blocage ne se prolonge pas tant que l'on insiste et prend fin 15 min après la plus ancienne tentative acceptée.
 */
export async function tooManyAttempts(db: DB, key: string, max = 10, windowMs = 15 * 60_000, now = Date.now()): Promise<boolean> {
  const k = hashKey(key)
  const since = new Date(now - windowMs)
  await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(now - RETENTION_MS))) // toutes clés : la table ne grossit pas
  const [{ id }] = await db.insert(loginAttempts).values({ key: k, at: new Date(now) }).returning({ id: loginAttempts.id })
  const [{ n }] = await db.select({ n: count() }).from(loginAttempts)
    .where(and(eq(loginAttempts.key, k), gte(loginAttempts.at, since)))
  if (n <= max) return false
  await db.delete(loginAttempts).where(eq(loginAttempts.id, id))
  return true
}

export async function resetAttempts(db: DB, key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, hashKey(key)))
}
