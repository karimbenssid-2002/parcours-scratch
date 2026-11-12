'use server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { liveDeps } from '@/lib/autograde/deps'
import { latestJob, requestCorrection, type JobView } from '@/lib/autograde/service'
import { AUTOGRADE_UNAVAILABLE, autogradeEnabled } from '@/lib/autograde/enabled'
import { pollSafetyNet, scheduleDrain } from '@/lib/autograde/launch'

export async function startCorrectionAction(progressId: string, mode: 'propose' | 'send'): Promise<{ error?: string; job?: JobView | null }> {
  const startedAt = Date.now()
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return { error: AUTOGRADE_UNAVAILABLE }
  if (mode !== 'propose' && mode !== 'send') return { error: 'Mode inconnu.' }
  const db = getDb()
  const deps = liveDeps()
  const result = await requestCorrection(db, deps, teacher.id, progressId, mode)
  if (!result.ok) return { error: result.error }
  scheduleDrain(startedAt, await headers()) // après la réponse, même si l'onglet est fermé
  return { job: await latestJob(db, teacher.id, progressId) }
}

export async function correctionStatusAction(progressId: string): Promise<JobView | null> {
  const teacher = await requireTeacher()
  if (!autogradeEnabled()) return null
  const startedAt = Date.now()
  const db = getDb()
  // Filet de sécurité : correction bloquée (fonction coupée), ou file arrêtée sans relance.
  await pollSafetyNet(db, liveDeps().now(), startedAt, await headers())
  const job = await latestJob(db, teacher.id, progressId)
  if (job?.status === 'applied') revalidatePath('/admin', 'layout') // décision envoyée : file et pastilles à jour
  return job
}
