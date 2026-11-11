'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getClassForTeacher } from '@/lib/db/classes'
import { addAssignments, removeAssignment, setAssignmentDue, setAssignmentOrder } from '@/lib/db/assignments'
import { parseSchoolDateTime } from '@/lib/deadlines/time'
import { setSolutionShared } from '@/lib/autograde/corrige'
import { parseLevel } from '@/lib/levels'
import { giveProgression, giveThemes } from '@/lib/progressions/give'

type Result = { error?: string; success?: string }

async function ownClass(classId: string) {
  const teacher = await requireTeacher()
  const db = getDb()
  const cls = await getClassForTeacher(db, teacher.id, classId)
  return cls ? { db, cls } : null
}
const done = (classId: string, r: Result): Result => { revalidatePath(`/admin/classes/${classId}`); return r }

export async function addAssignmentsAction(classId: string, activityIds: string[]): Promise<Result> {
  const own = await ownClass(classId)
  if (!own) return { error: 'Classe introuvable.' }
  const n = await addAssignments(own.db, classId, activityIds.slice(0, 200))
  return done(classId, { success: added(n) })
}

const added = (n: number) => (n === 0 ? 'Aucun nouveau défi ajouté.' : `${n} défi${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.`)

/** Donne des thèmes entiers, dans l'ordre donné ; les défis déjà donnés sont ignorés. */
export async function giveThemesAction(classId: string, themeIds: string[]): Promise<Result> {
  const own = await ownClass(classId)
  if (!own || !Array.isArray(themeIds)) return { error: 'Classe introuvable.' }
  const n = await giveThemes(own.db, classId, themeIds.slice(0, 50).map(String))
  return done(classId, { success: added(n) })
}

/** Donne tout le parcours d'un niveau : ses thèmes non facultatifs, dans l'ordre. */
export async function giveProgressionAction(classId: string, levelValue: string): Promise<Result> {
  const own = await ownClass(classId)
  const level = parseLevel(levelValue)
  if (!own || !level) return { error: 'Classe ou niveau invalide.' }
  const n = await giveProgression(own.db, classId, level)
  return done(classId, { success: added(n) })
}

export async function removeAssignmentAction(classId: string, activityId: string): Promise<Result> {
  const own = await ownClass(classId)
  if (!own) return { error: 'Classe introuvable.' }
  await removeAssignment(own.db, classId, activityId)
  return done(classId, {})
}

export async function saveAssignmentOrderAction(classId: string, activityIds: string[]): Promise<Result> {
  const own = await ownClass(classId)
  if (!own) return { error: 'Classe introuvable.' }
  if (!(await setAssignmentOrder(own.db, classId, activityIds))) return { error: 'La liste a changé entre-temps. Rechargez la page.' }
  return {} // pas de revalidation : l'état local fait foi (garde le focus)
}

export async function setAssignmentDueAction(classId: string, activityId: string, value: string): Promise<Result> {
  const own = await ownClass(classId)
  if (!own) return { error: 'Classe introuvable.' }
  const dueAt = value.trim() === '' ? null : parseSchoolDateTime(value)
  if (value.trim() !== '' && !dueAt) return { error: 'Date limite invalide : indiquez un jour et une heure.' }
  if (!(await setAssignmentDue(own.db, classId, activityId, dueAt))) return { error: 'Défi introuvable dans cette classe.' }
  return done(classId, { success: dueAt ? 'Date limite enregistrée.' : 'Date limite supprimée.' })
}

/** Partage (ou retire) le corrigé d'un défi pour cette classe. */
export async function toggleSolutionAction(classId: string, activityId: string, shared: boolean): Promise<Result> {
  const own = await ownClass(classId)
  if (!own) return { error: 'Classe introuvable.' }
  if (!(await setSolutionShared(own.db, classId, activityId, shared))) return { error: 'Défi introuvable dans cette classe.' }
  return done(classId, { success: shared ? 'Corrigé partagé avec la classe.' : 'Corrigé retiré.' })
}
