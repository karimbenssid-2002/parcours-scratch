import { MAX_PROJECT_BYTES } from '@/lib/scratch/project-file'

const API = 'https://capytale2.ac-paris.fr/web/c-act/api/n'
const EXPIRED = 'Session Capytale expirée ou cookie incorrect.'

/** URL d'activité (…/c/0a1b-1234567/…), code (0a1b-1234567) ou NID seul. */
export function parseCapytaleRef(input: string): { code: string | null; nid: string } | null {
  const s = input.trim().toLowerCase()
  const code = s.match(/(?:^|\/c\/)([0-9a-f]{4})-(\d{3,})(?:\/|$)/)
  if (code) return { code: `${code[1]}-${code[2]}`, nid: code[2] }
  if (/^\d{3,}$/.test(s)) return { code: null, nid: s }
  return null
}

/** Le cookie n'est jamais stocké ; on le valide strictement pour empêcher toute injection d'en-tête. */
export function validateCapytaleCookie(name: string, value: string): string | null {
  if (!/^SSESS[0-9a-f]{32}$/i.test(name.trim())) return 'Le nom du cookie doit commencer par SSESS (voir F12 → Application → Cookies).'
  if (!/^[A-Za-z0-9%_-]{16,512}$/.test(value.trim())) return 'La valeur du cookie est invalide.'
  return null
}

export async function fetchCapytaleProject(
  nid: string, cookie: { name: string; value: string }, fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string }> {
  const invalid = validateCapytaleCookie(cookie.name, cookie.value)
  if (invalid) return { ok: false, error: invalid }
  if (!/^\d+$/.test(nid)) return { ok: false, error: 'Activité Capytale introuvable.' }
  let res: Response
  try {
    res = await fetchImpl(`${API}/${nid}/fields/content`, {
      headers: { Cookie: `${cookie.name.trim()}=${cookie.value.trim()}`, 'X-API-ACCESS': 'capytale' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return { ok: false, error: 'Capytale ne répond pas. Réessayez plus tard.' }
  }
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) return { ok: false, error: EXPIRED }
  if (res.status === 204) return { ok: false, error: 'Cette activité Capytale est vide.' }
  if (res.status === 404) return { ok: false, error: 'Activité Capytale introuvable.' }
  if (!res.ok) return { ok: false, error: `Capytale a répondu ${res.status}.` }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > MAX_PROJECT_BYTES) return { ok: false, error: 'Le projet Capytale dépasse 20 Mo.' }
  return { ok: true, bytes }
}
