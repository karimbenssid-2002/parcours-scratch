'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { setTeacherActive } from '@/lib/db/teachers'

export async function toggleTeacherActiveAction(id: string, active: boolean): Promise<{ error?: string }> {
  const me = await requireTeacher({ role: 'admin' })
  if (me.id === id) return { error: 'Vous ne pouvez pas désactiver votre propre compte.' }
  await setTeacherActive(getDb(), id, active)
  revalidatePath('/admin/enseignants')
  return {}
}
