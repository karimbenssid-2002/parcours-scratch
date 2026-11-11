'use client'
import { useState } from 'react'
import { Play } from 'lucide-react'
import { youtubeEmbedUrl } from '@/lib/youtube'

/** Vidéo YouTube chargée au clic : avant, seule la vignette est affichée (le lecteur pèse environ 1 Mo). */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false)
  if (!playing) {
    return (
      <button type="button" onClick={() => setPlaying(true)} aria-label={`Lire la vidéo : ${title}`} title={title}
        className="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-2xl bg-black">
        {/* Vignette servie par YouTube : hors du domaine du site, donc pas d'optimisation next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async"
          className="size-full object-cover opacity-90 transition group-hover:opacity-100" />
        <span aria-hidden className="absolute left-1/2 top-1/2 grid size-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-white shadow-[0_8px_24px_-8px_rgb(0_0_0/.6)] transition group-hover:scale-105">
          <Play className="size-8 translate-x-0.5 fill-current" />
        </span>
      </button>
    )
  }
  return (
    <div className="aspect-video overflow-hidden rounded-2xl bg-black">
      <iframe
        src={`${youtubeEmbedUrl(id)}&autoplay=1`}
        title={title}
        className="size-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  )
}
