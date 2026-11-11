import { NextResponse, type NextRequest } from 'next/server'
import { getTeacherForApi } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { MAX_THUMBNAIL_BYTES, clearThumbnail, fetchThumbnail, processThumbnail, saveThumbnail } from '@/lib/activities/thumbnail'
import { readBodyLimited } from '@/lib/http/body'

type Ctx = { params: Promise<{ activityId: string }> }

const forbidden = () => NextResponse.json({ error: 'Accès réservé à l’administrateur.' }, { status: 403 })
const notFound = () => NextResponse.json({ error: 'Activité introuvable.' }, { status: 404 })

async function isAdmin() {
  return (await getTeacherForApi())?.role === 'admin'
}

async function store(activityId: string, processed: Awaited<ReturnType<typeof processThumbnail>>) {
  if (!processed.ok) return NextResponse.json({ error: processed.error }, { status: 400 })
  const url = await saveThumbnail(getDb(), activityId, processed.webp)
  return url ? NextResponse.json({ url }) : notFound()
}

/** Envoi d'une image (corps brut, 2 Mo au plus). */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdmin())) return forbidden()
  const bytes = await readBodyLimited(request, MAX_THUMBNAIL_BYTES)
  if (!bytes) return NextResponse.json({ error: 'L’image dépasse 2 Mo.' }, { status: 413 })
  return store((await params).activityId, await processThumbnail(bytes))
}

/** Image donnée par son adresse : téléchargée une fois par le serveur, puis stockée comme un envoi. */
export async function POST(request: NextRequest, { params }: Ctx) {
  if (!(await isAdmin())) return forbidden()
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null
  if (typeof body?.url !== 'string' || !body.url.trim()) return NextResponse.json({ error: 'Indiquez l’adresse de l’image.' }, { status: 400 })
  return store((await params).activityId, await fetchThumbnail(body.url))
}

/** Retire la vignette. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  if (!(await isAdmin())) return forbidden()
  await clearThumbnail(getDb(), (await params).activityId)
  return NextResponse.json({ ok: true })
}
