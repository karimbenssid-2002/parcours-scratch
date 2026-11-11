import { NextResponse, type NextRequest } from 'next/server'
import { getStudentForApi } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { isProjectUploadPath, loadProject, projectUploadPath, saveProject } from '@/lib/projects/service'
import { receiveUpload, uploadTicket } from '@/lib/storage/direct-upload'

type Ctx = { params: Promise<{ activityId: string }> }

const unauthorized = () => NextResponse.json({ error: 'Connecte-toi pour continuer.' }, { status: 401 })

/** Projet de l'élève ; avec ?upload=1, ticket d'envoi direct au stockage (voir lib/storage/direct-upload). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const student = await getStudentForApi()
  if (!student) return unauthorized()
  const { activityId } = await params
  if (request.nextUrl.searchParams.has('upload')) {
    const target = await projectUploadPath(getDb(), student, activityId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })
    return NextResponse.json(await uploadTicket(target.path), { headers: { 'Cache-Control': 'no-store' } })
  }
  const result = await loadProject(getDb(), student, activityId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return new Response(result.bytes, {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Project-Source': result.source },
  })
}

/** Sauvegarde : corps brut (stockage local) ou { path } d'un fichier déposé dans le stockage en ligne. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const student = await getStudentForApi()
  if (!student) return unauthorized()
  const { activityId } = await params
  const received = await receiveUpload(request, (p) => isProjectUploadPath(student.id, activityId, p), 'Le projet dépasse 20 Mo.')
  if (!received.ok) return NextResponse.json({ error: received.error }, { status: received.status })
  const result = await saveProject(getDb(), student, activityId, received.bytes, received.uploaded)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ savedAt: result.savedAt })
}
