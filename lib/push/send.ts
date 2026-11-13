import 'server-only'
import { sendNotification, setVapidDetails } from 'web-push'
import type { DB } from '@/lib/db/client'
import { inArray, sql } from 'drizzle-orm'
import { classStudents, students, teachers } from '@/lib/db/schema'
import { normalizeEmail } from '@/lib/auth/validation'
import { deleteSubscriptionById, listSubscriptionsFor, type StoredSubscription } from '@/lib/db/push-subscriptions'
import { pushEnabled, vapidSubject } from './config'
import { isAllowedPushEndpoint } from './endpoint'

export type PushMessage = { title: string; body: string; url: string; tag?: string }
export type Recipient = { kind: 'student' | 'teacher'; id: string }
export type SendFn = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>

const MAX_PARALLEL = 10

const realSend: SendFn = async (sub, payload) => {
  setVapidDetails(vapidSubject()!, process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim())
  await sendNotification(sub, payload, { TTL: 24 * 3600 })
}

/** Identifiants autorisés à recevoir : enseignants actifs, élèves présents dans au moins une classe (une requête par type). */
async function allowedIds(db: DB, recipients: Recipient[]): Promise<{ teacher: Set<string>; student: Set<string> }> {
  const teacherIds = recipients.filter((r) => r.kind === 'teacher').map((r) => r.id)
  const studentIds = recipients.filter((r) => r.kind === 'student').map((r) => r.id)
  const teacher = new Set<string>()
  const student = new Set<string>()
  if (teacherIds.length) {
    const rows = await db.select({ id: teachers.id, active: teachers.isActive }).from(teachers).where(inArray(teachers.id, teacherIds))
    for (const r of rows) if (r.active) teacher.add(r.id)
  }
  if (studentIds.length) {
    const rows = await db.select({ id: students.id, email: students.email }).from(students).where(inArray(students.id, studentIds))
    const emails = rows.map((r) => normalizeEmail(r.email))
    const enrolled = emails.length
      ? await db.select({ email: sql<string>`lower(${classStudents.studentEmail})` }).from(classStudents)
        .where(inArray(sql`lower(${classStudents.studentEmail})`, emails))
      : []
    const inClass = new Set(enrolled.map((e) => e.email))
    for (const r of rows) if (inClass.has(normalizeEmail(r.email))) student.add(r.id)
  }
  return { teacher, student }
}

/**
 * Envoie une notification à tous les appareils des destinataires. Ne lève jamais ; supprime les abonnements
 * expirés (404/410). Journal : comptes seulement, jamais d'adresse, de nom ni d'endpoint.
 */
export async function sendPush(
  db: DB, recipients: Recipient[], message: PushMessage, deps: { send?: SendFn } = {},
): Promise<{ sent: number; removed: number; failed: number }> {
  const result = { sent: 0, removed: 0, failed: 0 }
  try {
    if (!deps.send && !pushEnabled()) return result
    const send = deps.send ?? realSend
    const unique = [...new Map(recipients.map((r) => [`${r.kind}:${r.id}`, r])).values()]
    const allowed = await allowedIds(db, unique)
    const found = [
      ...(await listSubscriptionsFor(db, 'teacher', [...allowed.teacher])),
      ...(await listSubscriptionsFor(db, 'student', [...allowed.student])),
    ]
    // Défense en profondeur : une ligne dont l'hôte n'est pas un service push connu n'est jamais appelée, et est supprimée.
    const subs: StoredSubscription[] = []
    for (const s of found) {
      if (isAllowedPushEndpoint(s.endpoint)) subs.push(s)
      else { try { await deleteSubscriptionById(db, s.id); result.removed++ } catch { result.failed++ } }
    }
    if (subs.length === 0) return result
    const payload = JSON.stringify(message)
    let next = 0
    const worker = async () => {
      while (next < subs.length) {
        const s = subs[next++]
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          result.sent++
        } catch (e) {
          const code = (e as { statusCode?: unknown }).statusCode
          if (code === 404 || code === 410) {
            try { await deleteSubscriptionById(db, s.id); result.removed++ } catch { result.failed++ }
          } else {
            result.failed++
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, subs.length) }, worker))
  } catch {
    console.error('[notifications] erreur interne')
  }
  console.log(`[notifications] envoyées=${result.sent} supprimées=${result.removed} échecs=${result.failed}`)
  return result
}
