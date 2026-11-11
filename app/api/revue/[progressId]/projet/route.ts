import { NextResponse, type NextRequest } from 'next/server'
import { getTeacherForApi } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { projectBytes } from '@/lib/projects/service'
import { getReviewView } from '@/lib/review/service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ progressId: string }> }) {
  const teacher = await getTeacherForApi()
  if (!teacher) return NextResponse.json({ error: 'Connectez-vous pour continuer.' }, { status: 401 })
  const view = await getReviewView(getDb(), teacher.id, (await params).progressId)
  if (!view) return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 })
  const { bytes, source } = await projectBytes(view.progress.projectPath, view.activity.starterProjectPath)
  return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Project-Source': source } })
}
