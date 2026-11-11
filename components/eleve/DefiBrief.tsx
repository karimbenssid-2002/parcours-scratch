import { ChevronDown, Lightbulb, Play } from 'lucide-react'
import { YouTubeEmbed } from '@/components/eleve/YouTubeEmbed'

type Props = {
  title: string
  statementYoutubeId: string | null
  instructions: string | null
  helpVideos: { title: string; youtubeId: string }[]
}

/** Énoncé et vidéos d'aide d'un défi, tels que les voit l'élève (page du défi et aperçu enseignant). */
export function DefiBrief({ title, statementYoutubeId, instructions, helpVideos }: Props) {
  const helpRow = (v: { title: string; youtubeId: string }) => (
    <li key={v.youtubeId} className="border-t border-line first:border-t-0">
      <details className="group/video">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-1 py-2.5 text-[15px] transition hover:text-primary-ink [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-wash text-primary-ink">
            <Play className="size-3.5 fill-current" />
          </span>
          <span className="flex-1">{v.title}</span>
          <ChevronDown className="size-4 shrink-0 text-muted transition group-open/video:rotate-180" aria-hidden />
        </summary>
        <div className="pb-3"><YouTubeEmbed id={v.youtubeId} title={v.title} /></div>
      </details>
    </li>
  )
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section aria-labelledby="enonce" className="glass p-5">
        <h2 id="enonce" className="mb-3 text-xl font-semibold">Énoncé</h2>
        {statementYoutubeId
          ? <YouTubeEmbed id={statementYoutubeId} title={`Énoncé du défi ${title}`} />
          : <p className="text-muted">Pas de vidéo d'énoncé pour ce défi.</p>}
        {instructions && <p className="mt-3 whitespace-pre-line">{instructions}</p>}
      </section>
      {helpVideos.length > 0 && (
        // Menu déroulant, fermé par défaut : l'élève l'ouvre seulement s'il en a besoin. Pas sur téléphone (consultation seule).
        <details className="glass group hidden overflow-hidden md:block">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition hover:bg-primary-wash/60 group-open:border-b group-open:border-line [&::-webkit-details-marker]:hidden">
            <Lightbulb className="size-5 shrink-0 text-primary-ink" aria-hidden />
            <h2 className="flex-1 text-xl font-semibold">Besoin d'aide ?</h2>
            <span className="text-sm text-muted">{helpVideos.length} vidéo{helpVideos.length > 1 ? 's' : ''}</span>
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary-wash text-primary-ink">
              <ChevronDown className="size-5 transition group-open:rotate-180" />
            </span>
          </summary>
          <ul className="px-4 py-1.5">{helpVideos.map(helpRow)}</ul>
        </details>
      )}
    </div>
  )
}
