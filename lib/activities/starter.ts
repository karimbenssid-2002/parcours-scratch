import { eq } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { getStarterPath, setStarter } from '@/lib/db/activities'
import { inspectScratchFile } from '@/lib/scratch/project-file'
import { deleteStored, writeStored } from '@/lib/storage/files'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Remplace le projet de départ d'une activité (le travail déjà commencé par les élèves n'est pas touché). */
export async function saveStarter(
  db: DB, activityId: string, bytes: Uint8Array, source: 'upload' | 'capytale',
): Promise<{ ok: true; format: 'sb3' | 'sb2' } | { ok: false; status: 400 | 404 | 413; error: string }> {
  if (!UUID.test(activityId) || (await db.select({ id: activities.id }).from(activities).where(eq(activities.id, activityId)).limit(1)).length === 0)
    return { ok: false, status: 404, error: 'Activité introuvable.' }
  const check = inspectScratchFile(bytes)
  if (!check.ok) return { ok: false, status: check.tooLarge ? 413 : 400, error: check.error }
  const previous = await getStarterPath(db, activityId)
  const rel = `starters/${activityId}.${check.format}`
  await writeStored(rel, bytes)
  await setStarter(db, activityId, rel, source)
  if (previous && previous !== rel) await deleteStored(previous)
  return { ok: true, format: check.format }
}
