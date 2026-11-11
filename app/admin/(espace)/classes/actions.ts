'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { addEmailsToClass, createClass, deleteClass, getClassForTeacher, removeEmailFromClass, updateClass } from '@/lib/db/classes'
import { parseEmailList } from '@/lib/classes/emails'
import { parseLevel, type Level } from '@/lib/levels'

export type ClassFormState = { error?: string } | null
export type AddStudentsState = { added: string[]; already: string[]; invalid: string[]; duplicates: string[]; error?: string } | null

function readClassForm(formData: FormData): { name: string; level: Level } | { error: string } {
  const name = String(formData.get('name') ?? '').trim()
  const level = parseLevel(formData.get('level'))
  if (name.length < 1 || name.length > 40) return { error: 'Le nom de la classe doit faire entre 1 et 40 caractères.' }
  if (!level) return { error: 'Choisissez un niveau.' }
  return { name, level }
}

export async function createClassAction(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const teacher = await requireTeacher()
  const input = readClassForm(formData)
  if ('error' in input) return input
  const created = await createClass(getDb(), teacher.id, input)
  redirect(`/admin/classes/${created.id}`)
}

export async function updateClassAction(classId: string, _prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const teacher = await requireTeacher()
  const input = readClassForm(formData)
  if ('error' in input) return input
  if (!(await updateClass(getDb(), teacher.id, classId, input))) return { error: 'Classe introuvable.' }
  revalidatePath(`/admin/classes/${classId}`)
  return null
}

export async function deleteClassAction(classId: string): Promise<void> {
  const teacher = await requireTeacher()
  await deleteClass(getDb(), teacher.id, classId)
  redirect('/admin/classes')
}

export async function addStudentsAction(classId: string, _prev: AddStudentsState, formData: FormData): Promise<AddStudentsState> {
  const teacher = await requireTeacher()
  const db = getDb()
  if (!(await getClassForTeacher(db, teacher.id, classId))) return { added: [], already: [], invalid: [], duplicates: [], error: 'Classe introuvable.' }
  const parsed = parseEmailList(String(formData.get('emails') ?? ''))
  if (parsed.valid.length === 0 && parsed.invalid.length === 0) return { added: [], already: [], invalid: [], duplicates: [], error: 'Collez au moins une adresse.' }
  const { added, already } = await addEmailsToClass(db, classId, parsed.valid)
  revalidatePath(`/admin/classes/${classId}`)
  return { added, already, invalid: parsed.invalid, duplicates: parsed.duplicates }
}

export async function removeStudentAction(classId: string, email: string): Promise<void> {
  const teacher = await requireTeacher()
  const db = getDb()
  if (!(await getClassForTeacher(db, teacher.id, classId))) return
  await removeEmailFromClass(db, classId, email)
  revalidatePath(`/admin/classes/${classId}`)
}
