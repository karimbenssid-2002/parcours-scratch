import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { getStudentForApi, getTeacherForApi } from '@/lib/auth/session'
import { deleteSubscription, saveSubscription, subscriptionMatches, type PushOwner } from '@/lib/db/push-subscriptions'
import { readBodyLimited } from '@/lib/http/body'
import { pushEnabled } from '@/lib/push/config'
import { isAllowedPushEndpoint } from '@/lib/push/endpoint'

// Abonnement Web Push d'un appareil. Node (accès base) ; jamais mis en cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const b64url = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/)
const bodySchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: b64url, auth: b64url }),
})

const COOKIE_MAX_AGE = 365 * 24 * 3600
const json = (error: string, status: number) => NextResponse.json({ error }, { status })
const cookieOptions = (maxAge: number) =>
  ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge }) as const

async function resolve(request: Request): Promise<
  { ok: true; app: 'eleve' | 'admin'; owner: PushOwner } | { ok: false; response: NextResponse }
> {
  if (!pushEnabled()) return { ok: false, response: new NextResponse(null, { status: 404 }) }
  const app = new URL(request.url).searchParams.get('app')
  if (app !== 'eleve' && app !== 'admin') return { ok: false, response: json('Application inconnue.', 400) }
  const account = app === 'eleve' ? await getStudentForApi() : await getTeacherForApi()
  if (!account) return { ok: false, response: json('Non connecté.', 401) }
  return { ok: true, app, owner: { kind: app === 'eleve' ? 'student' : 'teacher', id: account.id } }
}

const cookieName = (app: string) => `push_device_${app}`
function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=') || null
  }
  return null
}

// Cet appareil est-il bien connu du serveur pour ce compte ? (la ligne du cookie existe et porte ce point d'accès)
export async function GET(request: Request) {
  const who = await resolve(request)
  if (!who.ok) return who.response
  const id = cookieValue(request, cookieName(who.app))
  const endpoint = new URL(request.url).searchParams.get('endpoint')
  let subscribed = false
  if (id && endpoint && endpoint.length <= 1000) {
    try { subscribed = await subscriptionMatches(getDb(), who.owner, id, endpoint) } catch { subscribed = false }
  }
  return NextResponse.json({ subscribed }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request) {
  const who = await resolve(request)
  if (!who.ok) return who.response
  const raw = await readBodyLimited(request, 8 * 1024)
  if (!raw) return json('Requête trop volumineuse.', 413)
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder().decode(raw)) } catch { return json('Abonnement invalide.', 400) }
  const body = bodySchema.safeParse(parsed)
  if (!body.success) return json('Abonnement invalide.', 400)
  const id = await saveSubscription(getDb(), who.owner, { endpoint: body.data.endpoint, keys: body.data.keys })
  const res = NextResponse.json({ ok: true }, { status: 201 })
  res.cookies.set(cookieName(who.app), id, cookieOptions(COOKIE_MAX_AGE))
  return res
}

export async function DELETE(request: Request) {
  const who = await resolve(request)
  if (!who.ok) return who.response
  const name = cookieName(who.app)
  const id = cookieValue(request, name)
  if (id) await deleteSubscription(getDb(), who.owner, id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(name, '', cookieOptions(0))
  return res
}
