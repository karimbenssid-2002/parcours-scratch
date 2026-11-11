'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getActivityDetail } from '@/lib/db/activities'
import {
  addToTheme, createTheme, deleteTheme, removeFromTheme, setThemeItemOrder, setThemeOrder, updateTheme, updateThemeItem,
  type ThemeItemInput,
} from '@/lib/db/progressions'
import { THEME_STEPS } from '@/lib/db/schema'
import { parseLevel } from '@/lib/levels'

type Result = { error?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STALE = 'L’ordre a changé entre-temps, rechargez la page.'
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function admin() {
  await requireTeacher({ role: 'admin' })
}
function done(): Result {
  revalidatePath('/admin/parcours')
  return {}
}

function parseItem(v: unknown): ThemeItemInput | null {
  if (!v || typeof v !== 'object') return null
  const { step, difficulty, why } = v as Record<string, unknown>
  if (!THEME_STEPS.includes(step as never) || ![1, 2, 3].includes(Number(difficulty))) return null
  return { step: step as ThemeItemInput['step'], difficulty: Number(difficulty) as 1 | 2 | 3, why: text(why, 400) }
}

export async function createThemeAction(levelValue: string, title: string): Promise<Result & { id?: string }> {
  await admin()
  const level = parseLevel(levelValue)
  const name = text(title, 200)
  if (!level) return { error: 'Niveau invalide.' }
  if (!name) return { error: 'Donnez un titre au thème.' }
  const { id } = await createTheme(getDb(), { level, title: name })
  return { ...done(), id }
}

export async function updateThemeAction(id: string, patch: { title: string; programme: string; intro: string; optional: boolean }): Promise<Result> {
  await admin()
  if (!isId(id) || !patch || typeof patch !== 'object') return { error: 'Thème introuvable.' }
  const title = text(patch.title, 200)
  if (!title) return { error: 'Donnez un titre au thème.' }
  await updateTheme(getDb(), id, { title, programme: text(patch.programme, 1000), intro: text(patch.intro, 2000), optional: patch.optional === true })
  return done()
}

export async function deleteThemeAction(id: string): Promise<Result> {
  await admin()
  if (!isId(id)) return { error: 'Thème introuvable.' }
  await deleteTheme(getDb(), id)
  return done()
}

export async function saveThemeOrderAction(levelValue: string, ids: string[]): Promise<Result> {
  await admin()
  const level = parseLevel(levelValue)
  if (!level || !Array.isArray(ids)) return { error: 'Niveau invalide.' }
  if (!(await setThemeOrder(getDb(), level, ids.map(String)))) return { error: STALE }
  return done()
}

export async function addToThemeAction(themeId: string, activityId: string): Promise<Result> {
  await admin()
  const db = getDb()
  if (!isId(themeId) || !isId(activityId) || !(await getActivityDetail(db, activityId))) return { error: 'Activité introuvable.' }
  if (!(await addToTheme(db, themeId, activityId, { step: 'decouvrir', difficulty: 1, why: '' }))) return { error: 'Ce défi est déjà dans le thème, ou le thème a été supprimé entre-temps : rechargez la page.' }
  return done()
}

export async function updateThemeItemAction(themeId: string, activityId: string, item: ThemeItemInput): Promise<Result> {
  await admin()
  const parsed = parseItem(item)
  if (!isId(themeId) || !isId(activityId) || !parsed) return { error: 'Valeurs invalides.' }
  await updateThemeItem(getDb(), themeId, activityId, parsed)
  return done()
}

export async function removeFromThemeAction(themeId: string, activityId: string): Promise<Result> {
  await admin()
  if (!isId(themeId) || !isId(activityId)) return { error: 'Activité introuvable.' }
  await removeFromTheme(getDb(), themeId, activityId)
  return done()
}

export async function saveThemeItemOrderAction(themeId: string, ids: string[]): Promise<Result> {
  await admin()
  if (!isId(themeId) || !Array.isArray(ids)) return { error: 'Thème introuvable.' }
  if (!(await setThemeItemOrder(getDb(), themeId, ids.map(String)))) return { error: STALE }
  return done()
}
