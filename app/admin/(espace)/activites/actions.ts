'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { createActivity, getActivityDetail, replaceHelpVideos, setActivityLevels, updateActivity, claimAnnouncements } from '@/lib/db/activities'
import { saveStarter } from '@/lib/activities/starter'
import { fetchCapytaleProject, parseCapytaleRef } from '@/lib/capytale/import'
import { parseYoutubeId } from '@/lib/youtube'
import { LEVELS, type Level } from '@/lib/levels'
import { schedule } from '@/lib/push/schedule'
import { notifyNewActivities } from '@/lib/push/events'

export type ActivityFormState = { error?: string; success?: string } | null

const MAX_HELP = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createActivityAction(_prev: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireTeacher({ role: 'admin' })
  const title = String(formData.get('title') ?? '').trim()
  if (title.length < 1 || title.length > 80) return { error: 'Le titre doit faire entre 1 et 80 caractères.' }
  const { id } = await createActivity(getDb(), { title })
  redirect(`/admin/activites/${id}`)
}

export async function saveActivityAction(activityId: string, _prev: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireTeacher({ role: 'admin' })
  const db = getDb()
  const detail = UUID.test(activityId) ? await getActivityDetail(db, activityId) : null
  if (!detail) return { error: 'Activité introuvable.' }

  const title = String(formData.get('title') ?? '').trim()
  if (title.length < 1 || title.length > 80) return { error: 'Le titre doit faire entre 1 et 80 caractères.' }
  const instructions = String(formData.get('instructions') ?? '').trim()
  if (instructions.length > 2000) return { error: 'La consigne ne doit pas dépasser 2 000 caractères.' }
  const statementRaw = String(formData.get('statement') ?? '').trim()
  const statementYoutubeId = statementRaw ? parseYoutubeId(statementRaw) : null
  if (statementRaw && !statementYoutubeId) return { error: 'La vidéo d’énoncé n’est pas une adresse YouTube valide.' }

  const helpTitles = formData.getAll('helpTitle').map(String)
  const helpUrls = formData.getAll('helpUrl').map(String)
  if (helpUrls.length > MAX_HELP) return { error: `${MAX_HELP} vidéos d’aide au plus.` }
  const help: { title: string; youtubeId: string }[] = []
  for (const [i, url] of helpUrls.entries()) {
    if (!url.trim() && !helpTitles[i]?.trim()) continue
    const youtubeId = parseYoutubeId(url)
    if (!youtubeId) return { error: `La vidéo d’aide n°${i + 1} n’est pas une adresse YouTube valide.` }
    help.push({ title: helpTitles[i]?.trim().slice(0, 120) || `Vidéo d’aide ${i + 1}`, youtubeId })
  }

  const levels = formData.getAll('levels').map(String).filter((l): l is Level => (LEVELS as readonly string[]).includes(l))
  const status = formData.get('status') === 'published' ? 'published' : 'draft'

  await updateActivity(db, activityId, { title, instructions: instructions || null, statementYoutubeId, status })
  await replaceHelpVideos(db, activityId, help)
  await setActivityLevels(db, activityId, levels)
  // Une activité n'est annoncée qu'une fois (première publication) : réservation atomique, donc ni republication ni deux onglets n'annoncent deux fois.
  const announced = await claimAnnouncements(db, [activityId])
  if (announced.length) schedule(() => notifyNewActivities(db, announced))
  revalidatePath('/admin/activites')
  revalidatePath(`/admin/activites/${activityId}`)
  const warnings = [
    status === 'published' && levels.length === 0 ? 'elle n’est rattachée à aucun niveau, aucun élève ne la verra' : null,
    status === 'published' && !detail.starterProjectPath ? 'elle n’a pas de projet de départ, les élèves partiront d’un projet vierge' : null,
  ].filter(Boolean)
  return { success: `Activité enregistrée.${warnings.length ? ` Attention : ${warnings.join(' ; ')}.` : ''}` }
}

export async function importCapytaleAction(activityId: string, _prev: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireTeacher({ role: 'admin' })
  const db = getDb()
  const ref = parseCapytaleRef(String(formData.get('capytale') ?? ''))
  if (!ref) return { error: 'Adresse ou code Capytale invalide (exemple : https://capytale2.ac-paris.fr/web/c/0a1b-1234567/local).' }
  // Le cookie n'est utilisé que pour cette requête : jamais enregistré ni journalisé.
  const fetched = await fetchCapytaleProject(ref.nid, {
    name: String(formData.get('cookieName') ?? ''),
    value: String(formData.get('cookieValue') ?? ''),
  })
  if (!fetched.ok) return { error: fetched.error }
  const saved = await saveStarter(db, activityId, fetched.bytes, 'capytale')
  if (!saved.ok) return { error: saved.error }
  await db.update(activities).set({
    capytaleNid: ref.nid,
    capytaleUrl: ref.code ? `https://capytale2.ac-paris.fr/web/c/${ref.code}/local` : null,
  }).where(eq(activities.id, activityId))
  revalidatePath(`/admin/activites/${activityId}`)
  return { success: `Projet de départ récupéré depuis Capytale (.${saved.format}).` }
}
