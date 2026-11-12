'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { AUTOGRADE_MODELS, saveEffort, saveMonthlyCap, setSetting, type AutogradeModel } from '@/lib/db/autograde'

export async function setModelAction(formData: FormData): Promise<void> {
  await requireTeacher({ role: 'admin' })
  const model = String(formData.get('model') ?? '')
  if (!(AUTOGRADE_MODELS as string[]).includes(model)) return
  await setSetting(getDb(), 'autograde_model', model as AutogradeModel)
  revalidatePath('/admin/correction')
}

export type SettingState = { error?: string; success?: string } | null

export async function setMonthlyCapAction(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireTeacher({ role: 'admin' })
  const r = await saveMonthlyCap(getDb(), String(formData.get('cap') ?? '').trim())
  if (!r.ok) return { error: 'Valeur refusée : un entier entre 0 et 100 000.' }
  revalidatePath('/admin/correction')
  revalidatePath('/admin/a-valider')
  return { success: 'Plafond enregistré.' }
}

export async function setEffortAction(_prev: SettingState, formData: FormData): Promise<SettingState> {
  await requireTeacher({ role: 'admin' })
  const r = await saveEffort(getDb(), String(formData.get('effort') ?? ''))
  if (!r.ok) return { error: 'Niveau inconnu.' }
  revalidatePath('/admin/correction')
  return { success: 'Niveau de réflexion enregistré.' }
}
