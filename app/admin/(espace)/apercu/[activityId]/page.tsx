import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Eye } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { canPreviewActivity } from '@/lib/auth/access'
import { getDb } from '@/lib/db/client'
import { getActivityDetail } from '@/lib/db/activities'
import { levelLabel } from '@/lib/levels'
import { DefiBrief } from '@/components/eleve/DefiBrief'
import { PreviewWorkspace } from './PreviewWorkspace'

export const metadata = { title: 'Aperçu d’un défi' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le défi tel que le voit l'élève, pour l'essayer avant de le donner : rien n'est enregistré ni envoyé. */
export default async function PreviewPage({ params }: { params: Promise<{ activityId: string }> }) {
  const teacher = await requireTeacher()
  const { activityId } = await params
  const activity = UUID.test(activityId) ? await getActivityDetail(getDb(), activityId) : null
  if (!activity || !canPreviewActivity(teacher.role, activity.status)) notFound()
  return (
    <div className="space-y-[22px]">
      <div className="flex flex-wrap items-center gap-3">
        {teacher.role === 'admin' && (
          <Link href={`/admin/activites/${activity.id}`} className="glass inline-flex items-center gap-2 rounded-2xl! px-4 py-2.5 text-[15px] font-semibold text-primary-ink hover:bg-tile">
            <ArrowLeft className="size-4" aria-hidden />Modifier l’activité
          </Link>
        )}
        <p className="inline-flex items-center gap-2 rounded-2xl bg-tile px-4 py-2.5 font-semibold text-primary-ink">
          <Eye className="size-5" aria-hidden />Aperçu élève : vous pouvez tout essayer, rien n’est enregistré ni envoyé.
        </p>
      </div>
      <header className="space-y-2">
        {activity.levels.length > 0 && (
          <p className="inline-block rounded-full bg-tile-muted px-3 py-[5px] text-[13px] font-semibold">{activity.levels.map(levelLabel).join(' · ')}</p>
        )}
        <h1 className="font-display text-[40px] font-semibold leading-none md:text-[60px]">{activity.title}</h1>
      </header>
      <DefiBrief title={activity.title} statementYoutubeId={activity.statementYoutubeId} instructions={activity.instructions} helpVideos={activity.helpVideos} />
      <PreviewWorkspace activityId={activity.id} />
    </div>
  )
}
