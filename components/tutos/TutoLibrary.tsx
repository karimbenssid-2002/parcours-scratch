'use client'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { YouTubeEmbed } from '@/components/eleve/YouTubeEmbed'
import { TUTOS } from '@/lib/tutos/catalogue'
import { groupTutos } from '@/lib/tutos/search'

/** Bibliothèque des tutos Scratch de Modulo, par catégorie, avec une recherche (élève et enseignant). */
export function TutoLibrary() {
  const [q, setQ] = useState('')
  const groups = useMemo(() => groupTutos(TUTOS, q), [q])
  const count = groups.reduce((n, g) => n + g.tutos.length, 0)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-72">
          <span className="sr-only">Chercher un tuto</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher un tuto"
            placeholder="Chercher un tuto : stylo, variable, répéter…"
            className="w-full rounded-[10px] border-2 border-line bg-tile py-2.5 pl-11 pr-4 text-base text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none" />
        </label>
        <p role="status" className="text-sm text-muted">{count} tuto{count > 1 ? 's' : ''}</p>
      </div>
      {groups.length === 0 && <p className="glass p-6 text-muted">Aucun tuto ne correspond à « {q.trim()} ».</p>}
      {groups.map((g) => (
        <section key={g.category} aria-labelledby={`cat-${g.category}`} className="space-y-3">
          <h2 id={`cat-${g.category}`} className="text-xl font-semibold">
            {g.category} <span className="text-base font-medium text-muted">· {g.tutos.length}</span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.tutos.map((t) => (
              <li key={t.youtubeId} className="glass space-y-2 p-3">
                <YouTubeEmbed id={t.youtubeId} title={t.title} />
                <div className="px-1">
                  <h3 className="font-semibold leading-snug">{t.title}</h3>
                  {t.summary && <p className="text-sm leading-snug text-muted">{t.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
