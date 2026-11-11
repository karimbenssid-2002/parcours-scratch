'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { liveDeps } from '@/lib/autograde/deps'
import { latestJob, requestCorrection, type JobView } from '@/lib/autograde/service'
import { AUTOGRADE_UNAVAILABLE, autogradeEnabled } from '@/lib/autograde/enabled'
import { ensureWorker } from '@/lib/autograde/worker'

export async function startCorrectionAction(progressId: string, mode: 'propose' | 'send'): Promise<{ error?: string; job?: JobView | null }> {
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return { error: AUTOGRADE_UNAVAILABLE }
  if (mode !== 'propose' && mode !== 'send') return { error: 'Mode inconnu.' }
  const db = getDb()
  const result = await requestCorrection(db, liveDeps(), teacher.id, progressId, mode)
  if (!result.ok) return { error: result.error }
  ensureWorker()
  return { job: await latestJob(db, teacher.id, progressId) }
}

export async function correctionStatusAction(progressId: string): Promise<JobView | null> {
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return null
  ensureWorker() // reprise après redémarrage si besoin
  const job = await latestJob(getDb(), teacher.id, progressId)
  if (job?.status === 'applied') revalidatePath('/admin', 'layout') // décision envoyée : file et pastilles à jour
  return job
}
