'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { approveTeacherRequest, type ApproveResult } from '@/lib/auth/teacher-approval'
import { markRequest } from '@/lib/db/teacher-requests'
import { safeAction } from '@/lib/http/safe-action'

// Pas de revalidatePath ici : la ligne disparaîtrait de la liste (la demande n'est plus « pending »)
// avant que l'admin ait pu lire la confirmation. La page est rafraîchie quand il la ferme.
export async function approveRequestAction(id: string): Promise<ApproveResult> {
  await requireTeacher({ role: 'admin' })
  // Création du compte (adresse dans les paramètres) : une erreur imprévue est journalisée sans l'adresse.
  return safeAction('validation de demande', () => approveTeacherRequest(getDb(), id),
    () => ({ ok: false, error: 'La validation a échoué. Réessayez.' }))
}

export async function rejectRequestAction(id: string): Promise<void> {
  await requireTeacher({ role: 'admin' })
  await markRequest(getDb(), id, 'rejected')
  revalidatePath('/admin', 'layout')
}
