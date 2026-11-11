import { readBodyLimited } from '@/lib/http/body'
import { MAX_PROJECT_BYTES } from '@/lib/scratch/project-file'
import { deleteStored, readStored, signedUploadUrl, storedSize } from './files'

// Envoi direct des projets au stockage en ligne (les fonctions Vercel refusent les corps de plus de 4,5 Mo).
// 1. GET ?upload=1 : le serveur choisit le chemin et renvoie une URL signée (ou { direct: true } en local).
// 2. Le navigateur dépose le fichier à cette URL (lib/storage/upload-client.ts).
// 3. PUT { path } : le serveur vérifie que le chemin est celui qu'il aurait délivré, relit et valide le fichier.

export type UploadTicket = { url: string; token: string; path: string } | { direct: true }

export async function uploadTicket(rel: string): Promise<UploadTicket> {
  const signed = await signedUploadUrl(rel)
  return signed ? { ...signed, path: rel } : { direct: true }
}

/** Dépôt temporaire d'un projet de départ ou d'une solution : un seul par activité. */
export const adminUploadPath = (kind: 'starters' | 'solutions', activityId: string) => `${kind}/${activityId}.envoi`

/** Ticket admin : l'URL signée ne remplace rien (pas d'upsert), donc un dépôt abandonné est d'abord supprimé. */
export async function adminUploadTicket(kind: 'starters' | 'solutions', activityId: string): Promise<UploadTicket> {
  const rel = adminUploadPath(kind, activityId)
  await deleteStored(rel)
  return uploadTicket(rel)
}

export type Received =
  | { ok: true; bytes: Uint8Array; uploaded: string | null }
  | { ok: false; status: 400 | 403 | 413; error: string }

const MAX_CONFIRM_BYTES = 4096

/**
 * Corps d'un PUT : octets bruts (stockage local), ou confirmation JSON { path } d'un fichier déposé dans le stockage.
 * Un chemin que `allowed` refuse donne 403 sans rien toucher ; un fichier trop gros est supprimé.
 */
export async function receiveUpload(request: Request, allowed: (path: string) => boolean, tooLarge = 'Le fichier dépasse 20 Mo.'): Promise<Received> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_PROJECT_BYTES) return { ok: false, status: 413, error: tooLarge }
    const bytes = await readBodyLimited(request, MAX_PROJECT_BYTES) // content-length peut être absent ou faux
    return bytes ? { ok: true, bytes, uploaded: null } : { ok: false, status: 413, error: tooLarge }
  }
  const raw = await readBodyLimited(request, MAX_CONFIRM_BYTES)
  let path: unknown
  try {
    path = raw && (JSON.parse(new TextDecoder().decode(raw)) as { path?: unknown }).path
  } catch {
    path = undefined
  }
  if (typeof path !== 'string' || !allowed(path)) return { ok: false, status: 403, error: 'Envoi refusé.' }
  // Taille lue dans les métadonnées avant tout téléchargement : un fichier énorme n'est jamais chargé en mémoire.
  // (Si le stockage ne la donne pas, le contrôle après lecture reste ; la limite du bucket, 20 Mo, reste obligatoire.)
  const size = await storedSize(path)
  if (size === null) return { ok: false, status: 400, error: 'Le fichier envoyé est introuvable.' }
  if (size !== undefined && size > MAX_PROJECT_BYTES) {
    await deleteStored(path)
    return { ok: false, status: 413, error: tooLarge }
  }
  const stored = await readStored(path)
  if (!stored) return { ok: false, status: 400, error: 'Le fichier envoyé est introuvable.' }
  if (stored.byteLength > MAX_PROJECT_BYTES) {
    await deleteStored(path)
    return { ok: false, status: 413, error: tooLarge }
  }
  return { ok: true, bytes: new Uint8Array(stored), uploaded: path }
}
