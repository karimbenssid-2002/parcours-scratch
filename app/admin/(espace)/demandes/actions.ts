'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { approveTeacherRequest, type ApproveResult } from '@/lib/auth/teacher-approval'
import { markRequest } from '@/lib/db/teacher-requests'

// Pas de revalidatePath ici : la ligne disparaîtrait de la liste (la demande n'est plus « pending »)
// avant que l'admin ait pu lire le mot de passe provisoire. La page est rafraîchie quand il confirme l'avoir noté.
export async function approveRequestAction(id: string): Promise<ApproveResult> {
  await requireTeacher({ role: 'admin' })
  return approveTeacherRequest(getDb(), id)
}

export async function rejectRequestAction(id: string): Promise<void> {
  await requireTeacher({ role: 'admin' })
  await markRequest(getDb(), id, 'rejected')
  revalidatePath('/admin', 'layout')
}
