import { and, asc, count, eq } from 'drizzle-orm'
import type { DB } from './client'
import { teacherRequests } from './schema'
import { findTeachersByIdentity } from './teachers'
import { namesFromEmail, normalizeEmail } from '@/lib/auth/validation'
import { teacherIdentity } from '@/lib/auth/identity'

export type TeacherRequest = typeof teacherRequests.$inferSelect

/**
 * Demande de compte enseignant. `duplicate` (rien n'est créé) si un compte ou une demande en attente existe déjà pour la
 * même identité prenom.nom, quel que soit le domaine. L'index unique partiel « teacher_requests_one_pending », porté par
 * l'identité, tranche entre deux envois simultanés.
 */
export async function createTeacherRequest(db: DB, email: string): Promise<'created' | 'duplicate'> {
  const e = normalizeEmail(email)
  if ((await findTeachersByIdentity(db, teacherIdentity(e), 1)).length) return 'duplicate'
  const inserted = await db.insert(teacherRequests).values({ email: e, ...namesFromEmail(e) }).onConflictDoNothing()
    .returning({ id: teacherRequests.id })
  return inserted.length ? 'created' : 'duplicate'
}

export async function listPendingRequests(db: DB): Promise<TeacherRequest[]> {
  return db.select().from(teacherRequests).where(eq(teacherRequests.status, 'pending'))
    .orderBy(asc(teacherRequests.createdAt))
}

export async function countPendingRequests(db: DB): Promise<number> {
  const [row] = await db.select({ n: count() }).from(teacherRequests).where(eq(teacherRequests.status, 'pending'))
  return row?.n ?? 0
}

export async function findRequestById(db: DB, id: string): Promise<TeacherRequest | null> {
  const [row] = await db.select().from(teacherRequests).where(eq(teacherRequests.id, id)).limit(1)
  return row ?? null
}

/**
 * Réserve atomiquement une demande en attente (UPDATE … WHERE status = 'pending').
 * Renvoie false si elle a déjà été traitée, y compris par une validation simultanée.
 */
export async function claimPendingRequest(db: DB, id: string): Promise<boolean> {
  return (await db.update(teacherRequests).set({ status: 'approved', processedAt: new Date().toISOString() })
    .where(and(eq(teacherRequests.id, id), eq(teacherRequests.status, 'pending')))
    .returning({ id: teacherRequests.id })).length === 1
}

export async function setRequestStatus(db: DB, id: string, status: 'pending' | 'approved' | 'rejected'): Promise<void> {
  await db.update(teacherRequests).set({ status, processedAt: status === 'pending' ? null : new Date().toISOString() })
    .where(eq(teacherRequests.id, id))
}

export async function markRequest(db: DB, id: string, status: 'approved' | 'rejected'): Promise<void> {
  await db.update(teacherRequests).set({ status, processedAt: new Date().toISOString() })
    .where(and(eq(teacherRequests.id, id), eq(teacherRequests.status, 'pending')))
}
