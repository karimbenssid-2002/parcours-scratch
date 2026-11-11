'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { decide, queueNeighbors, reviewQueue } from '@/lib/review/service'
import { markApplied, pendingProposals } from '@/lib/autograde/service'

export async function decideAction(progressId: string, classId: string | null, _prev: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  const teacher = await requireTeacher()
  const db = getDb()
  const queue = () => reviewQueue(db, teacher.id, classId ?? undefined) // file de la classe choisie, sinon toute la file
  const { next } = queueNeighbors(await queue(), progressId) // le défi qui suivait celui-ci
  // Proposition de correction automatique reprise par le professeur : la décision est marquée « vérifiée par » lui.
  const jobId = String(formData.get('autogradeJobId') ?? '')
  const proposal = jobId ? (await pendingProposals(db, [progressId])).get(progressId) : undefined
  const fromProposal = proposal?.jobId === jobId
  const result = await decide(db, teacher.id, progressId, {
    decision: String(formData.get('decision') ?? ''),
    comment: String(formData.get('comment') ?? ''),
    extendTo: String(formData.get('extendTo') ?? ''),
  }, fromProposal ? { automatic: true, verifiedBy: teacher.id } : {})
  if (!result.ok) return { error: result.error }
  if (fromProposal) await markApplied(db, jobId, progressId)
  revalidatePath('/admin', 'layout')
  const remaining = await queue()
  const target = remaining.find((q) => q.progressId === next) ?? remaining[0]
  const inClass = classId ? `?classe=${classId}` : ''
  // Classe terminée : retour au choix des classes.
  redirect(target ? `/admin/revue/${target.progressId}${inClass}` : '/admin/a-valider')
}
