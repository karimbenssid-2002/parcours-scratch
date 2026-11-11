import { and, asc, count, eq } from 'drizzle-orm'
import type { DB } from './client'
import { teacherRequests } from './schema'
import { namesFromEmail, normalizeEmail } from '@/lib/auth/validation'

export type TeacherRequest = typeof teacherRequests.$inferSelect
export type RequestType = 'registration' | 'reset'

export async function createTeacherRequest(db: DB, type: RequestType, email: string): Promise<void> {
  const e = normalizeEmail(email)
  const names = type === 'registration' ? namesFromEmail(e) : { firstName: null, lastName: null }
  // Demande identique déjà en attente : l'index unique partiel « teacher_requests_one_pending » l'ignore, même en simultané.
  await db.insert(teacherRequests).values({ type, email: e, ...names }).onConflictDoNothing()
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
