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

const LOT = 100

/** Compte les fichiers d'un dossier local (0 s'il n'existe pas). */
async function countLocal(dir: string): Promise<number> {
  let entries
  try {
    entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw e
  }
  let n = 0
  for (const entry of entries) {
    n += entry.isDirectory() ? await countLocal(path.join(dir, entry.name)) : 1
  }
  return n
}

/**
 * Efface tout un dossier (`prefix` finit par « / ») et renvoie le nombre de fichiers effacés.
 * `complete: false` si l'échéance `deadlineMs` (horodatage) est passée avant la fin : rappeler pour continuer.
 * L'échéance n'est vérifiée qu'avant chaque `list` et ne s'applique qu'à Supabase (ignorée en local).
 */
export async function deleteStoredPrefix(
  prefix: string,
  opts: { deadlineMs?: number } = {},
): Promise<{ deleted: number; complete: boolean }> {
  if (!prefix.endsWith('/')) throw new Error(`Le préfixe doit finir par « / » : ${prefix}`)
  checkRel(prefix)
  if (!isSupabase()) {
    const dir = storagePath(prefix)
    const deleted = await countLocal(dir)
    await fs.rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true })
    return { deleted, complete: true }
  }
  const b = bucket()
  const expire = () => opts.deadlineMs !== undefined && Date.now() > opts.deadlineMs
  let deleted = 0
  let lot: string[] = []
  const vider = async () => {
    if (!lot.length) return
    const { error } = await b.remove(lot)
    if (error) throw error
    deleted += lot.length
    lot = []
  }
  // Un niveau est lu en entier (toutes les pages) avant toute suppression : supprimer pendant la pagination
  // décalerait les offsets et ferait sauter des fichiers.
  const parcourir = async (dir: string): Promise<boolean> => {
    const dossiers: string[] = []
    const fichiers: string[] = []
    for (let offset = 0; ; offset += LOT) {
      if (expire()) return false
      const { data, error } = await b.list(dir, { limit: LOT, offset })
      if (error) throw error
      for (const item of data ?? []) (item.id === null ? dossiers : fichiers).push(`${dir}/${item.name}`)
      if ((data?.length ?? 0) < LOT) break
    }
    for (const f of fichiers) {
      lot.push(f)
      if (lot.length >= LOT) await vider()
    }
    for (const sous of dossiers) if (!(await parcourir(sous))) return false
    return true
  }
  const complete = await parcourir(prefix.slice(0, -1))
  await vider()
  return { deleted, complete }
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

/**
 * Noms des dossiers du premier niveau sous `prefix` (qui finit par « / ») ; les fichiers posés directement sous
 * `prefix` sont ignorés. Liste vide si le dossier n'existe pas. Sert à la reprise de la remise à zéro annuelle.
 */
export async function listStoredFolders(prefix: string): Promise<string[]> {
  if (!prefix.endsWith('/')) throw new Error(`Le préfixe doit finir par « / » : ${prefix}`)
  checkRel(prefix)
  if (!isSupabase()) {
    try {
      const entries = await fs.readdir(/*turbopackIgnore: true*/ storagePath(prefix), { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }
  const b = bucket()
  const dossiers: string[] = []
  for (let offset = 0; ; offset += LOT) {
    const { data, error } = await b.list(prefix.slice(0, -1), { limit: LOT, offset })
    if (error) throw error
    for (const item of data ?? []) if (item.id === null) dossiers.push(item.name)
    if ((data?.length ?? 0) < LOT) break
  }
  return dossiers
}
