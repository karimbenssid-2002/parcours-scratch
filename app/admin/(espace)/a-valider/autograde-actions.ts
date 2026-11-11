'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { liveDeps } from '@/lib/autograde/deps'
import { requestClassCorrection, runStatus } from '@/lib/autograde/service'
import { AUTOGRADE_UNAVAILABLE, autogradeEnabled } from '@/lib/autograde/enabled'
import { ensureWorker } from '@/lib/autograde/worker'

export type ClassRun = Awaited<ReturnType<typeof runStatus>>

export async function startClassCorrectionAction(classId: string, mode: 'propose' | 'send'): Promise<{ error?: string; count?: number; skipped?: number }> {
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return { error: AUTOGRADE_UNAVAILABLE }
  if (mode !== 'propose' && mode !== 'send') return { error: 'Mode inconnu.' }
  const result = await requestClassCorrection(getDb(), liveDeps(), teacher.id, classId, mode)
  if (!result.ok) return { error: result.error }
  if (result.count > 0) ensureWorker()
  revalidatePath('/admin/a-valider')
  return { count: result.count, skipped: result.skipped }
}

export async function classCorrectionStatusAction(classId: string): Promise<ClassRun> {
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return null
  ensureWorker() // reprise après redémarrage si besoin
  const status = await runStatus(getDb(), teacher.id, classId)
  if (status?.finished) revalidatePath('/admin', 'layout') // décisions envoyées : file et pastilles à jour
  return status
}
