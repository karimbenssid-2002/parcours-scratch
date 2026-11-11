'use server'
import { revalidatePath } from 'next/cache'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { finishAtDeadline, restartDefi, submitDefi } from '@/lib/projects/service'

export async function submitDefiAction(activityId: string): Promise<{ error?: string }> {
  const student = await requireStudent()
  const result = await submitDefi(getDb(), student, activityId)
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  return {}
}

export async function restartDefiAction(activityId: string): Promise<{ error?: string }> {
  const student = await requireStudent()
  const result = await restartDefi(getDb(), student, activityId)
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  return {}
}

/** Appelé par le navigateur à l'heure exacte de l'échéance. */
export async function finishAtDeadlineAction(activityId: string): Promise<{ error?: string }> {
  const student = await requireStudent()
  const result = await finishAtDeadline(getDb(), student, activityId)
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  return {}
}
