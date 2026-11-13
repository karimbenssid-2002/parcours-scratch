import fs from 'node:fs/promises'
import path from 'node:path'
import type { DB } from '@/lib/db/client'
import type { Student } from '@/lib/db/students'
import { getActivityDetail, type ActivityDetail } from '@/lib/db/activities'
import { studentDeadline } from '@/lib/db/assignments'
import { getProgress, recordSave, restartProgress, submitProgressId, type Progress } from '@/lib/db/progress'
import { canEdit } from '@/lib/progress/rules'
import { inspectScratchFile } from '@/lib/scratch/project-file'
import { deleteStored, readStored, writeStored } from '@/lib/storage/files'
import { closeOverdue } from '@/lib/deadlines/close'
import { now } from '@/lib/clock'
import { schedule } from '@/lib/push/schedule'
import { notifySubmission } from '@/lib/push/events'

export type ServiceError = { ok: false; status: 400 | 404 | 409 | 413; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BLANK_PROJECT = path.join(process.cwd(), 'scratch-editor', 'blank.sb3')
const NOT_FOUND: ServiceError = { ok: false, status: 404, error: 'Défi introuvable.' }
const LOCKED: ServiceError = { ok: false, status: 409, error: 'Ce défi est entre les mains de ton professeur : tu ne peux plus le modifier.' }

const newProjectPath = (studentId: string, activityId: string) =>
  `projets/${studentId}/${activityId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.sb3`

/** Travail de l'élève, sinon projet de départ, sinon projet vierge. */
export async function projectBytes(projectPath: string | null, starterPath: string | null): Promise<{ bytes: Uint8Array<ArrayBuffer>; source: 'eleve' | 'depart' | 'vierge' }> {
  if (projectPath) {
    const bytes = await readStored(projectPath)
    if (bytes) return { bytes: new Uint8Array(bytes), source: 'eleve' }
  }
  if (starterPath) {
    const bytes = await readStored(starterPath)
    if (bytes) return { bytes: new Uint8Array(bytes), source: 'depart' }
  }
  return { bytes: new Uint8Array(await fs.readFile(BLANK_PROJECT)), source: 'vierge' }
}

export const DEADLINE_PASSED = 'La date limite est passée : tu ne peux plus envoyer ce défi, sauf si ton professeur t’accorde du temps.'

/** Un défi donné à une classe de l'élève (et publié) ; rend d'abord ce défi si son échéance est passée. */
export async function openActivityFor(db: DB, student: Student, activityId: string): Promise<{ detail: ActivityDetail; progress: Progress | null; dueAt: string | null; number: number } | null> {
  if (!UUID.test(activityId)) return null
  const deadline = await studentDeadline(db, student.id, activityId)
  if (!deadline.visible) return null
  await closeOverdue(db, now(), { only: { studentId: student.id, activityId } })
  const detail = await getActivityDetail(db, activityId)
  if (!detail) return null
  return { detail, progress: await getProgress(db, student.id, activityId), dueAt: deadline.dueAt, number: deadline.number! }
}

export async function loadProject(db: DB, student: Student, activityId: string) {
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) return NOT_FOUND
  return { ok: true as const, ...(await projectBytes(opened.progress?.projectPath ?? null, opened.detail.starterProjectPath)) }
}

/** Chemin d'envoi direct d'une sauvegarde (stockage en ligne) : délivré seulement si l'élève peut encore modifier. */
export async function projectUploadPath(db: DB, student: Student, activityId: string): Promise<{ ok: true; path: string } | ServiceError> {
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) return NOT_FOUND
  if (opened.progress && !canEdit(opened.progress.status)) return LOCKED
  return { ok: true, path: newProjectPath(student.id, activityId) }
}

/** Le chemin confirmé par le navigateur est-il de la forme que `projectUploadPath` délivre à cet élève pour ce défi ? */
export function isProjectUploadPath(studentId: string, activityId: string, rel: string): boolean {
  const prefix = `projets/${studentId}/${activityId}-`
  return UUID.test(activityId) && rel.startsWith(prefix) && /^[0-9a-z-]+\.sb3$/.test(rel.slice(prefix.length))
}

/**
 * Enregistre une sauvegarde. `uploaded` : fichier déjà déposé dans le stockage par le navigateur (envoi direct),
 * enregistré tel quel s'il est valide, supprimé sinon.
 */
export async function saveProject(db: DB, student: Student, activityId: string, bytes: Uint8Array, uploaded: string | null = null): Promise<{ ok: true; savedAt: string } | ServiceError> {
  const opened = await openActivityFor(db, student, activityId)
  const reject = async (error: ServiceError) => {
    // Jamais le fichier que la base référence encore (un chemin déjà enregistré renvoyé une seconde fois).
    if (uploaded && uploaded !== opened?.progress?.projectPath) await deleteStored(uploaded)
    return error
  }
  if (!opened) return reject(NOT_FOUND)
  if (opened.progress && !canEdit(opened.progress.status)) return reject(LOCKED)
  // Confirmation rejouée du fichier déjà enregistré : rien à faire. L'enregistrer à nouveau pourrait, si une sauvegarde
  // plus récente arrive entre-temps, faire pointer la base vers ce fichier après sa suppression.
  if (uploaded && uploaded === opened.progress?.projectPath) return { ok: true, savedAt: opened.progress.updatedAt }
  const check = inspectScratchFile(bytes)
  if (!check.ok) return reject({ ok: false, status: check.tooLarge ? 413 : 400, error: check.error })
  if (check.format !== 'sb3') return reject({ ok: false, status: 400, error: 'La sauvegarde doit être un projet Scratch 3 (.sb3).' })

  // Chaque sauvegarde est un nouveau fichier : la base ne le référence qu'après la mise à jour conditionnelle.
  // Si le défi a été envoyé entre-temps (autre onglet), le fichier envoyé au professeur reste intact.
  const rel = uploaded ?? newProjectPath(student.id, activityId)
  if (!uploaded) await writeStored(rel, bytes)
  if (!(await recordSave(db, student.id, activityId, rel))) {
    if (rel !== opened.progress?.projectPath) await deleteStored(rel)
    return LOCKED
  }
  const previous = opened.progress?.projectPath
  if (previous && previous !== rel) await deleteStored(previous)
  return { ok: true, savedAt: new Date().toISOString() }
}

export async function submitDefi(db: DB, student: Student, activityId: string): Promise<{ ok: true } | ServiceError> {
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) return NOT_FOUND
  if (opened.dueAt && now().toISOString() > opened.dueAt) return { ok: false, status: 409, error: DEADLINE_PASSED }
  const progressId = await submitProgressId(db, student.id, activityId)
  if (!progressId)
    return { ok: false, status: 409, error: 'Sauvegarde ton travail avant de l’envoyer (ou il a déjà été envoyé).' }
  schedule(() => notifySubmission(db, progressId))
  return { ok: true }
}

/** Appelé par le navigateur à l'heure exacte : rend le défi sans attendre la marge. */
export async function finishAtDeadline(db: DB, student: Student, activityId: string): Promise<{ ok: true } | ServiceError> {
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) return NOT_FOUND
  if (!opened.dueAt || now().toISOString() < opened.dueAt) return { ok: false, status: 409, error: 'La date limite n’est pas encore atteinte.' }
  await closeOverdue(db, now(), { only: { studentId: student.id, activityId }, graceMs: 0 })
  return { ok: true }
}

export async function restartDefi(db: DB, student: Student, activityId: string): Promise<{ ok: true } | ServiceError> {
  const opened = await openActivityFor(db, student, activityId)
  if (!opened) return NOT_FOUND
  const result = await restartProgress(db, student.id, activityId)
  if (!result.ok) return LOCKED
  if (result.previousPath) await deleteStored(result.previousPath)
  return { ok: true }
}
