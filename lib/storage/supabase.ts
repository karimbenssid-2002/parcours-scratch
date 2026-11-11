import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Stockage Supabase (bucket privé). Serveur uniquement : la clé service_role ne doit jamais atteindre le client.
type Result<T> = Promise<{ data: T | null; error: (Error & { status?: number; statusCode?: string; code?: string }) | null }>

/** Le sous-ensemble de `supabase.storage.from(bucket)` utilisé ici (et remplaçable dans les tests). */
export interface BucketClient {
  upload(path: string, body: Uint8Array, options: { upsert: boolean; contentType?: string }): Result<unknown>
  /** Métadonnées de l'objet (storage-js : `size` facultatif). */
  info(path: string): Result<{ size?: number }>
  download(path: string): Result<Blob>
  remove(paths: string[]): Result<unknown>
  createSignedUploadUrl(path: string, options: { upsert: boolean }): Result<{ signedUrl: string; token: string; path: string }>
}

let override: BucketClient | null = null
let cached: BucketClient | null = null

/** Réservé aux tests : injecte un faux client (null pour revenir au vrai). */
export function setBucketForTests(client: BucketClient | null): void {
  override = client
}

export function bucket(): BucketClient {
  if (override) return override
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Stockage Supabase non configuré : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  cached = client.storage.from(process.env.SUPABASE_BUCKET ?? 'parcours') as unknown as BucketClient
  return cached
}

/** Objet absent : Supabase répond 400 ou 404 avec le code « 404 » / « Object not found ».
 * Un bucket absent (« Bucket not found », même code 404) n'en est pas un : c'est une erreur de configuration
 * (SUPABASE_BUCKET), qui doit échouer au lieu de faire passer chaque fichier pour absent. */
export function isNotFound(e: { status?: number; statusCode?: string; message?: string; code?: string }): boolean {
  if (e.code === 'NoSuchBucket' || /bucket/i.test(e.message ?? '')) return false
  return e.statusCode === '404' || e.status === 404 || e.code === 'NoSuchKey' || /object not found/i.test(e.message ?? '')
}
