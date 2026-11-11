'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { grantExtension } from '@/lib/deadlines/extensions'
import { parseSchoolDateTime } from '@/lib/deadlines/time'

/** Rouvre un défi (Non rendu, ou échéance passée) avec une nouvelle date limite pour cet élève. */
export async function reopenWithDeadlineAction(studentId: string, activityId: string, _prev: { error?: string; success?: string } | null, formData: FormData) {
  const teacher = await requireTeacher()
  const dueAt = parseSchoolDateTime(String(formData.get('dueAt') ?? ''))
  if (!dueAt) return { error: 'Date limite invalide : indiquez un jour et une heure.' }
  const result = await grantExtension(getDb(), teacher.id, studentId, activityId, dueAt)
  if (!result.ok) return { error: result.error }
  revalidatePath(`/admin/suivi/eleves/${studentId}`)
  return { success: 'Nouvelle date limite enregistrée.' }
}
