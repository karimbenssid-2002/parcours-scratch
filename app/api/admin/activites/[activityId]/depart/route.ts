import { NextResponse, type NextRequest } from 'next/server'
import { getTeacherForApi } from '@/lib/auth/session'
import { canPreviewActivity } from '@/lib/auth/access'
import { getDb } from '@/lib/db/client'
import { getActivityDetail } from '@/lib/db/activities'
import { saveStarter } from '@/lib/activities/starter'
import { projectBytes } from '@/lib/projects/service'
import { deleteStored } from '@/lib/storage/files'
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
  return NextResponse.json(await adminUploadTicket('starters', activityId), { headers: { 'Cache-Control': 'no-store' } })
}

/** Aperçu élève : projet de départ, ou projet vierge. Ouvert à tout enseignant pour le stock publié. ?upload=1 : ticket d’envoi (admin). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const teacher = await getTeacherForApi()
  if (!teacher) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 })
  const { activityId } = await params
  if (request.nextUrl.searchParams.has('upload')) return ticket(teacher.role, activityId)
  const detail = UUID.test(activityId) ? await getActivityDetail(getDb(), activityId) : null
  if (!detail || !canPreviewActivity(teacher.role, detail.status)) return NextResponse.json({ error: 'Activité introuvable.' }, { status: 404 })
  const { bytes, source } = await projectBytes(null, detail.starterProjectPath)
  return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Project-Source': source } })
}

/** Envoi d'un fichier .sb3 ou .sb2 (20 Mo au plus) : corps brut, ou { path } du dépôt dans le stockage en ligne. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAdmin())) return forbidden()
  const { activityId } = await params
  const received = await receiveUpload(request, (p) => UUID.test(activityId) && p === adminUploadPath('starters', activityId))
  if (!received.ok) return NextResponse.json({ error: received.error }, { status: received.status })
  let result
  try {
    result = await saveStarter(getDb(), activityId, received.bytes, 'upload')
  } finally {
    if (received.uploaded) await deleteStored(received.uploaded) // dépôt temporaire : le fichier validé a été réécrit
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ format: result.format })
}
