'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { AUTOGRADE_MODELS, setSetting, type AutogradeModel } from '@/lib/db/autograde'

export async function setModelAction(formData: FormData): Promise<void> {
  await requireTeacher({ role: 'admin' })
  const model = String(formData.get('model') ?? '')
  if (!(AUTOGRADE_MODELS as string[]).includes(model)) return
  await setSetting(getDb(), 'autograde_model', model as AutogradeModel)
  revalidatePath('/admin/correction')
}
