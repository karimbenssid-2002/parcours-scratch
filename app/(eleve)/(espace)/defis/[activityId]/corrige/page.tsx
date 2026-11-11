import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getActivityDetail } from '@/lib/db/activities'
import { canSeeSolution } from '@/lib/autograde/corrige'
import { ScratchEditor } from '@/components/scratch/ScratchEditor'

export const metadata = { title: 'Corrigé' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CorrigePage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params
  const student = await requireStudent()
  const db = getDb()
  if (!UUID.test(activityId) || !(await canSeeSolution(db, { studentId: student.id }, activityId))) notFound()
  const activity = await getActivityDetail(db, activityId)
  if (!activity) notFound()
  return (
    <div className="space-y-6">
      <Link href={`/defis/${activityId}`} className="glass inline-flex items-center gap-2 rounded-2xl! px-4 py-2.5 text-[15px] font-semibold text-primary-ink hover:bg-tile">
        <ArrowLeft className="size-4" aria-hidden />Retour au défi
      </Link>
      <header>
        <p className="inline-block rounded-full bg-st-ok-bg px-3 py-[5px] text-[13px] font-semibold text-st-ok">Corrigé</p>
        <h1 className="font-display text-[40px] font-semibold leading-none">{activity.title}</h1>
        <p className="mt-1 text-muted">Lance le corrigé avec le drapeau vert et compare-le à ton travail. Ton projet n’est pas modifié.</p>
      </header>
      <p className="glass p-4 text-center font-semibold text-muted md:hidden">Pour voir le corrigé, utilise un ordinateur ou une tablette en mode paysage.</p>
      <div className="hidden md:block">
        <ScratchEditor projectUrl={`/api/corrige/${activityId}`} mode="player" />
      </div>
    </div>
  )
}
