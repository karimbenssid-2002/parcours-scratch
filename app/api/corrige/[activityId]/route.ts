import { NextResponse, type NextRequest } from 'next/server'
import { getStudentForApi, getTeacherForApi } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getAutogradeDraft } from '@/lib/db/autograde'
import { canSeeSolution } from '@/lib/autograde/corrige'
import { readStored } from '@/lib/storage/files'

type Ctx = { params: Promise<{ activityId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ error: 'Corrigé introuvable.' }, { status: 404 })

/** Fichier du corrigé : enseignants, ou élève dont une classe a partagé le corrigé (le proxy ne couvre pas /api). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { activityId } = await params
  if (!UUID.test(activityId)) return notFound()
  const db = getDb()
  const teacher = await getTeacherForApi()
  const student = teacher ? null : await getStudentForApi()
  if (!teacher && !student) return NextResponse.json({ error: 'Connecte-toi pour continuer.' }, { status: 401 })
  const allowed = await canSeeSolution(db, teacher ? { teacherId: teacher.id } : { studentId: student!.id }, activityId)
  if (!allowed) return notFound()
  const draft = await getAutogradeDraft(db, activityId)
  const bytes = draft?.hasSolution ? await readStored(`solutions/${activityId}.${draft.solutionFormat}`) : null
  if (!bytes) return notFound()
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } })
}
