import fs from 'node:fs/promises'
import path from 'node:path'
import { bucket, isNotFound } from './supabase'

// Stockage local des fichiers (projets de départ, travaux des élèves).
// Deux supports, choisis par STORAGE_BACKEND : « local » (défaut, dossier storage/) ou « supabase » (bucket privé).
// Chemins dynamiques ignorés par le traçage du build : sinon tout le projet (base, travaux des élèves,
// éditeur Scratch) est embarqué dans le code serveur déployé.
const root = () => path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? 'storage')

const isSupabase = () => process.env.STORAGE_BACKEND === 'supabase'

/** Validation commune aux deux supports : chemin relatif, sans « .. » ni racine. */
function checkRel(rel: string): void {
  if (!rel || rel.startsWith('/') || rel.startsWith('\\') || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`Chemin de stockage invalide : ${rel}`)
  }
}

/** Chemin du système de fichiers : support local uniquement. */
export function storagePath(rel: string): string {
  const base = root()
  const full = path.resolve(/*turbopackIgnore: true*/ base, rel)
  if (!full.startsWith(base + path.sep)) throw new Error(`Chemin de stockage invalide : ${rel}`)
  return full
}

/** Écriture atomique : un fichier à moitié écrit n'est jamais lu. */
export async function writeStored(rel: string, bytes: Uint8Array): Promise<void> {
  if (isSupabase()) {
    checkRel(rel)
    const { error } = await bucket().upload(rel, bytes, { upsert: true, contentType: 'application/octet-stream' })
    if (error) throw error
    return
  }
  const full = storagePath(rel)
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true })
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(/*turbopackIgnore: true*/ tmp, bytes)
  await fs.rename(/*turbopackIgnore: true*/ tmp, full)
}

export async function readStored(rel: string): Promise<Buffer | null> {
  if (isSupabase()) {
    checkRel(rel)
    const { data, error } = await bucket().download(rel)
    if (error) {
      if (isNotFound(error)) return null
      throw error
    }
    return Buffer.from(await data!.arrayBuffer())
  }
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ storagePath(rel))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** Taille d'un fichier sans le lire : null s'il est absent, undefined si le stockage ne la donne pas. */
export async function storedSize(rel: string): Promise<number | null | undefined> {
  if (isSupabase()) {
    checkRel(rel)
    const { data, error } = await bucket().info(rel)
    if (error) {
      if (isNotFound(error)) return null
      throw error
    }
    return typeof data?.size === 'number' ? data.size : undefined
  }
  try {
    return (await fs.stat(/*turbopackIgnore: true*/ storagePath(rel))).size
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function deleteStored(rel: string): Promise<void> {
  if (isSupabase()) {
    checkRel(rel)
    const { error } = await bucket().remove([rel])
    if (error) throw error
    return
  }
  await fs.rm(/*turbopackIgnore: true*/ storagePath(rel), { force: true })
}

/**
 * URL d'envoi direct vers le bucket (fichiers trop gros pour passer par le serveur). Null en local.
 * Sans upsert : l'URL (valable 2 h) ne crée l'objet qu'une fois et ne peut pas remplacer un fichier déjà validé.
 */
export async function signedUploadUrl(rel: string): Promise<{ url: string; token: string } | null> {
  if (!isSupabase()) return null
  checkRel(rel)
  const { data, error } = await bucket().createSignedUploadUrl(rel, { upsert: false })
  if (error) throw error
  return { url: data!.signedUrl, token: data!.token }
}
