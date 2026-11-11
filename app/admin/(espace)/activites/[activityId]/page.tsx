import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { getActivityDetail } from '@/lib/db/activities'
import { YouTubeEmbed } from '@/components/eleve/YouTubeEmbed'
import { ActivityForm } from './ActivityForm'
import { StarterPanel } from './StarterPanel'
import { ThumbnailPanel } from './ThumbnailPanel'
import { AutogradePanel } from './AutogradePanel'
import { getAutogradeDraft, isAutogradeReady } from '@/lib/db/autograde'
import { formatKeys } from '@/lib/autograde/keys'

export const metadata = { title: 'Activité' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  await requireTeacher({ role: 'admin' })
  const { activityId } = await params
  const activity = UUID.test(activityId) ? await getActivityDetail(getDb(), activityId) : null
  if (!activity) notFound()
  const draft = await getAutogradeDraft(getDb(), activity.id)
  const ready = await isAutogradeReady(getDb(), activity.id)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/activites" className="inline-flex flex-1 items-center gap-2 font-semibold text-primary-ink hover:underline"><ArrowLeft className="size-4" aria-hidden />Activités</Link>
        <Link href={`/admin/apercu/${activity.id}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-primary-ink shadow-soft hover:bg-surface">
          <Play className="size-4" aria-hidden />Tester l'activité
        </Link>
      </div>
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{activity.title}</h1>
      <ActivityForm
        activityId={activity.id}
        title={activity.title}
        instructions={activity.instructions}
        statementYoutubeId={activity.statementYoutubeId}
        status={activity.status}
        levels={activity.levels}
        helpVideos={activity.helpVideos}
      />
      {activity.statementYoutubeId && (
        <details className="glass p-4">
          <summary className="cursor-pointer font-semibold">Aperçu de la vidéo d'énoncé enregistrée</summary>
          <div className="mt-3 max-w-xl"><YouTubeEmbed id={activity.statementYoutubeId} title={`Énoncé du défi ${activity.title}`} /></div>
        </details>
      )}
      <ThumbnailPanel activityId={activity.id} thumbnail={activity.thumbnail} />
      <StarterPanel activityId={activity.id} source={activity.starterSource} capytaleUrl={activity.capytaleUrl} />
      <AutogradePanel activityId={activity.id} ready={ready} solutionFormat={draft?.hasSolution ? draft.solutionFormat : null}
        criteria={draft?.criteria ?? []} answers={draft?.answers ?? []} keys={formatKeys(draft?.keys ?? [])} durationMs={draft?.durationMs ?? 10_000} />
    </div>
  )
}
