import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities, classActivities, classes, classStudents, progress, students, teacherRequests, teachers } from '@/lib/db/schema'
import { sendPush, type PushMessage, type Recipient } from './send'

const TITLE = 'Parcours Scratch'
const msg = (body: string, url: string, tag?: string): PushMessage => ({ title: TITLE, body, url, ...(tag ? { tag } : {}) })
const teacherRecipient = (id: string): Recipient => ({ kind: 'teacher', id })

/** Pour chaque couple (élève, défi), les enseignants dont une classe contient l'élève (e-mail sans tenir compte de la casse) et donne ce défi. */
async function teachersOfPairs(db: DB, pairs: { studentId: string; activityId: string }[]): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  if (pairs.length === 0) return result
  const rows = await db.select({ studentId: students.id, activityId: classActivities.activityId, teacherId: classes.teacherId })
    .from(classActivities)
    .innerJoin(classes, eq(classes.id, classActivities.classId))
    .innerJoin(classStudents, eq(classStudents.classId, classes.id))
    .innerJoin(students, sql`lower(${students.email}) = lower(${classStudents.studentEmail})`)
    .where(and(inArray(students.id, [...new Set(pairs.map((p) => p.studentId))]), inArray(classActivities.activityId, [...new Set(pairs.map((p) => p.activityId))])))
  const wanted = new Set(pairs.map((p) => `${p.studentId}:${p.activityId}`))
  for (const r of rows) {
    const key = `${r.studentId}:${r.activityId}`
    if (!wanted.has(key)) continue
    const set = result.get(key) ?? new Set<string>()
    set.add(r.teacherId)
    result.set(key, set)
  }
  return result
}

/** Une copie vient d'être rendue : prévient les enseignants des classes de l'élève qui donnent ce défi. */
export async function notifySubmission(db: DB, progressId: string): Promise<void> {
  try {
    const [row] = await db.select({ studentId: progress.studentId, activityId: progress.activityId, firstName: students.firstName, lastName: students.lastName, title: activities.title })
      .from(progress)
      .innerJoin(students, eq(students.id, progress.studentId))
      .innerJoin(activities, eq(activities.id, progress.activityId))
      .where(eq(progress.id, progressId)).limit(1)
    if (!row) return
    const byPair = await teachersOfPairs(db, [row])
    const ids = byPair.get(`${row.studentId}:${row.activityId}`)
    if (!ids?.size) return
    await sendPush(db, [...ids].map(teacherRecipient),
      msg(`${row.firstName} ${row.lastName} a rendu ${row.title}`, `/admin/revue/${progressId}`, `copie-${progressId}`))
  } catch {
    console.error('[notifications] erreur interne')
  }
}

/** Copies rendues automatiquement à l'échéance : une notification groupée par enseignant concerné. */
export async function notifyAutoSubmissions(db: DB, closed: { studentId: string; activityId: string }[]): Promise<void> {
  try {
    const byPair = await teachersOfPairs(db, closed)
    const counts = new Map<string, number>()
    for (const pair of new Map(closed.map((c) => [`${c.studentId}:${c.activityId}`, c])).keys())
      for (const t of byPair.get(pair) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    for (const [teacherId, n] of counts)
      await sendPush(db, [teacherRecipient(teacherId)],
        msg(n === 1 ? '1 copie rendue automatiquement (date limite)' : `${n} copies rendues automatiquement (date limite)`, '/admin/a-valider'))
  } catch {
    console.error('[notifications] erreur interne')
  }
}

/** Activités qui viennent de passer de brouillon à publiée : tous les enseignants actifs. */
export async function notifyNewActivities(db: DB, activityIds: string[]): Promise<void> {
  try {
    if (activityIds.length === 0) return
    const list = await db.select({ id: activities.id, title: activities.title }).from(activities).where(inArray(activities.id, activityIds))
    if (list.length === 0) return
    const active = await db.select({ id: teachers.id, role: teachers.role }).from(teachers).where(eq(teachers.isActive, true))
    if (active.length === 0) return
    // Les pages de gestion sont réservées aux administrateurs : les enseignants ont l'aperçu (un défi) ou l'accueil de l'espace.
    const single = list.length === 1 ? list[0] : null
    const body = single ? `Nouvelle activité : ${single.title}` : `${list.length} nouvelles activités`
    const admins = active.filter((t) => t.role === 'admin'), profs = active.filter((t) => t.role !== 'admin')
    if (admins.length) await sendPush(db, admins.map((t) => teacherRecipient(t.id)), msg(body, single ? `/admin/activites/${single.id}` : '/admin/activites'))
    if (profs.length) await sendPush(db, profs.map((t) => teacherRecipient(t.id)), msg(body, single ? `/admin/apercu/${single.id}` : '/admin'))
  } catch {
    console.error('[notifications] erreur interne')
  }
}

/** Défis publiés qui viennent d'être ajoutés à la liste d'une classe : prévient les élèves de cette classe (comptes existants). */
export async function notifyNewAssignments(db: DB, classId: string, activityIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(activityIds)]
    if (ids.length === 0) return
    const list = await db.select({ id: activities.id, title: activities.title }).from(activities).where(inArray(activities.id, ids))
    if (list.length === 0) return
    const rows = await db.selectDistinct({ id: students.id }).from(classStudents)
      .innerJoin(students, sql`lower(${students.email}) = lower(${classStudents.studentEmail})`)
      .where(eq(classStudents.classId, classId))
    if (rows.length === 0) return
    const message = list.length === 1
      ? msg(`Nouveau défi à faire : ${list[0].title}`, `/defis/${list[0].id}`)
      : msg(`${list.length} nouveaux défis à faire`, '/')
    await sendPush(db, rows.map((r): Recipient => ({ kind: 'student', id: r.id })), message)
  } catch {
    console.error('[notifications] erreur interne')
  }
}

/** Une décision visible de l'élève vient d'être enregistrée : le prévient. */
export async function notifyReview(db: DB, progressId: string): Promise<void> {
  try {
    const [row] = await db.select({ studentId: progress.studentId, activityId: progress.activityId, title: activities.title })
      .from(progress).innerJoin(activities, eq(activities.id, progress.activityId))
      .where(eq(progress.id, progressId)).limit(1)
    if (!row) return
    await sendPush(db, [{ kind: 'student', id: row.studentId }], msg(`Nouveau retour sur ${row.title}`, `/defis/${row.activityId}`))
  } catch {
    console.error('[notifications] erreur interne')
  }
}

/** Nouvelle demande de compte enseignant : prévient les administrateurs. */
export async function notifyTeacherRequest(db: DB, requestId: string): Promise<void> {
  try {
    const [req] = await db.select().from(teacherRequests).where(eq(teacherRequests.id, requestId)).limit(1)
    if (!req) return
    const admins = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.role, 'admin'))
    if (admins.length === 0) return
    const name = [req.firstName, req.lastName].filter(Boolean).join(' ') || req.email
    await sendPush(db, admins.map((t) => teacherRecipient(t.id)), msg(`Nouvelle demande de compte enseignant : ${name}`, '/admin/demandes'))
  } catch {
    console.error('[notifications] erreur interne')
  }
}
