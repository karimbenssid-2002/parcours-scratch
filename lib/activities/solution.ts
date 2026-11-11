import { eq } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { getAutogradeDraft, setSolution } from '@/lib/db/autograde'
import { inspectScratchFile } from '@/lib/scratch/project-file'
import { deleteStored, writeStored } from '@/lib/storage/files'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Remplace la solution de référence d'une activité (correction automatique, corrigé partagé). */
export async function saveSolution(
  db: DB, activityId: string, bytes: Uint8Array,
): Promise<{ ok: true; format: 'sb3' | 'sb2' } | { ok: false; status: 400 | 404 | 413; error: string }> {
  if (!UUID.test(activityId) || (await db.select({ id: activities.id }).from(activities).where(eq(activities.id, activityId)).limit(1)).length === 0)
    return { ok: false, status: 404, error: 'Activité introuvable.' }
  const check = inspectScratchFile(bytes)
  if (!check.ok) return { ok: false, status: check.tooLarge ? 413 : 400, error: check.error }
  const draft = await getAutogradeDraft(db, activityId)
  const previous = draft?.hasSolution && draft.solutionFormat ? `solutions/${activityId}.${draft.solutionFormat}` : null
  const rel = `solutions/${activityId}.${check.format}`
  await writeStored(rel, bytes)
  await setSolution(db, activityId, rel, check.format)
  if (previous && previous !== rel) await deleteStored(previous)
  return { ok: true, format: check.format }
}

