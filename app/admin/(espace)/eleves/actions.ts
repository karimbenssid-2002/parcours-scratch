'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { eraseStudent } from '@/lib/retention/erase'
import { safeAction } from '@/lib/http/safe-action'

/**
 * Efface un élève et toutes ses données (compte, projets, retours, fichiers) ; administrateur uniquement.
 * `notice` : le compte et les données sont effacés, mais pas encore les fichiers (stockage indisponible) ; la tâche
 * quotidienne s'en charge. Une erreur de la base (rien n'est effacé) est journalisée sans l'adresse de l'élève, que la
 * requête porte en paramètre, et l'administrateur lit un message générique.
 */
export async function deleteStudent(studentId: string): Promise<{ error?: string; notice?: string }> {
  await requireTeacher({ role: 'admin' })
  return safeAction('suppression d’un élève', async () => {
    const { found, filesPending } = await eraseStudent(getDb(), studentId)
    if (!found) return { error: 'Élève introuvable.' }
    revalidatePath('/admin/eleves')
    return filesPending ? { notice: 'L’élève a été supprimé. Ses fichiers seront effacés automatiquement cette nuit.' } : {}
  }, () => ({ error: 'La suppression a échoué. Rechargez la page.' }))
}
