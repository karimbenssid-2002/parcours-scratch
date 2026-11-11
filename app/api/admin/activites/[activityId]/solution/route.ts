import { NextResponse, type NextRequest } from 'next/server'
import { getTeacherForApi } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getAutogradeDraft } from '@/lib/db/autograde'
import { saveSolution } from '@/lib/activities/solution'
import { deleteStored, readStored } from '@/lib/storage/files'
import { adminUploadPath, adminUploadTicket, receiveUpload } from '@/lib/storage/direct-upload'

type Ctx = { params: Promise<{ activityId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const forbidden = () => NextResponse.json({ error: 'Accès réservé à l’administrateur.' }, { status: 403 })

async function isAdmin() {
  return (await getTeacherForApi())?.role === 'admin'
}

/** Ticket d'envoi direct : le chemin de dépôt est fixe pour l'activité (voir lib/storage/direct-upload). */
async function ticket(role: string | undefined, activityId: string) {
  if (role !== 'admin') return forbidden()
  if (!UUID.test(activityId)) return NextResponse.json({ error: 'Activité introuvable.' }, { status: 404 })
  return NextResponse.json(await adminUploadTicket('solutions', activityId), { headers: { 'Cache-Control': 'no-store' } })
}

/** Solution de référence (aperçu admin) ; ?upload=1 : ticket d’envoi direct au stockage. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const teacher = await getTeacherForApi()
  const { activityId } = await params
  if (request.nextUrl.searchParams.has('upload')) return ticket(teacher?.role, activityId)
  if (teacher?.role !== 'admin') return forbidden()
  const draft = UUID.test(activityId) ? await getAutogradeDraft(getDb(), activityId) : null
  const bytes = draft?.hasSolution ? await readStored(`solutions/${activityId}.${draft.solutionFormat}`) : null
  if (!bytes) return NextResponse.json({ error: 'Aucune solution.' }, { status: 404 })
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } })
}

/** Envoi d'un fichier .sb3 ou .sb2 (20 Mo au plus) : corps brut, ou { path } du dépôt dans le stockage en ligne. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdmin())) return forbidden()
  const { activityId } = await params
  const received = await receiveUpload(request, (p) => UUID.test(activityId) && p === adminUploadPath('solutions', activityId))
  if (!received.ok) return NextResponse.json({ error: received.error }, { status: received.status })
  let result
  try {
    result = await saveSolution(getDb(), activityId, received.bytes)
  } finally {
    if (received.uploaded) await deleteStored(received.uploaded) // dépôt temporaire : le fichier validé a été réécrit
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ format: result.format })
}
