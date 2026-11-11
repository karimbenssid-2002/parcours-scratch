import { strFromU8, unzipSync } from 'fflate'

export const MAX_PROJECT_BYTES = 20 * 1024 * 1024
// Garde-fou contre les archives très compressées : un vrai project.json pèse quelques Mo au plus.
// La taille annoncée par l'en-tête peut mentir : fflate n'alloue alors que cette taille et échoue.
const MAX_PROJECT_JSON_BYTES = 10 * 1024 * 1024

export type ScratchFileCheck = { ok: true; format: 'sb3' | 'sb2' } | { ok: false; error: string; tooLarge?: boolean }

const NOT_SCRATCH: ScratchFileCheck = { ok: false, error: "Ce fichier n'est pas un projet Scratch (.sb3 ou .sb2)." }

/** Vérifie qu'un fichier est un projet Scratch 3 (.sb3) ou Scratch 2 (.sb2) lisible. */
export function inspectScratchFile(bytes: Uint8Array): ScratchFileCheck {
  if (bytes.byteLength > MAX_PROJECT_BYTES) return { ok: false, tooLarge: true, error: 'Le fichier dépasse 20 Mo.' }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'project.json' && f.originalSize <= MAX_PROJECT_JSON_BYTES })
  } catch {
    return NOT_SCRATCH
  }
  const raw = files['project.json']
  if (!raw) return NOT_SCRATCH
  let json: unknown
  try {
    json = JSON.parse(strFromU8(raw))
  } catch {
    return NOT_SCRATCH
  }
  if (typeof json !== 'object' || json === null) return NOT_SCRATCH
  if (Array.isArray((json as { targets?: unknown }).targets)) return { ok: true, format: 'sb3' }
  if ('objName' in json) return { ok: true, format: 'sb2' }
  return NOT_SCRATCH
}
