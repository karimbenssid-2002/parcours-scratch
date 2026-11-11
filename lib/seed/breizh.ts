import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '@/lib/db/client'
import { addToLevel, getStarterPath, replaceHelpVideos, setStarter, upsertBreizhActivity, type Section } from '@/lib/db/activities'
import { writeStored } from '@/lib/storage/files'
import { parseYoutubeId } from '@/lib/youtube'
import { slugify } from '@/lib/slug'

export { slugify }
import type { Level } from '@/lib/levels'

type VideoRef = { id: number; nom: string; youtube: string }
type Defi = {
  id: number; nom: string; youtubeId: string | null; image: string | null; programmeARecuperer: string | null
  videosAide: VideoRef[]; videosComplementaires: VideoRef[]
}
type Tutoriel = { id: number; nom: string; description: string; youtubeId: string }
type Page = { page: string; sections: { titre: string; defis: { ordre: number; id: number }[] }[] }

const PAGE_LEVEL: Record<string, Level> = { 'N6.html': '6', 'N5.html': '5', 'N4.html': '4', 'N3.html': '3' }

export function formatTitle(nom: string): string {
  const words = nom
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .split(' ')
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}


const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf-8')) as T

export async function importBreizh(db: DB, opts: { siteDir: string; publicDir: string }) {
  const dataDir = path.join(opts.siteDir, 'data')
  const defis = readJson<Defi[]>(path.join(dataDir, 'defis.json'))
  const tutos = new Map(readJson<Tutoriel[]>(path.join(dataDir, 'videos-tutoriels.json')).map((t) => [t.id, t]))
  const pages = readJson<Page[]>(path.join(dataDir, 'parcours.json'))
  fs.mkdirSync(opts.publicDir, { recursive: true })

  const idBySourceRef = new Map<number, string>()
  const createdRefs = new Set<number>()
  let created = 0
  let starters = 0
  let skipped = 0

  for (const d of defis) {
    let thumbnail: string | null = null
    if (d.image) {
      const src = path.join(opts.siteDir, d.image)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(opts.publicDir, path.basename(src)))
        thumbnail = `/activities/${path.basename(src)}`
      }
    }
    const title = formatTitle(d.nom)
    const res = await upsertBreizhActivity(db, {
      sourceRef: d.id, title, slug: slugify(title), statementYoutubeId: d.youtubeId, thumbnail,
    })
    idBySourceRef.set(d.id, res.id)
    // Projet de départ breizh : seulement si l'activité n'en a pas déjà un (jamais d'écrasement).
    if (d.programmeARecuperer && !(await getStarterPath(db, res.id))) {
      const src = path.join(opts.siteDir, d.programmeARecuperer)
      if (fs.existsSync(src)) {
        const rel = `starters/${res.id}${path.extname(src).toLowerCase()}`
        await writeStored(rel, new Uint8Array(fs.readFileSync(src)))
        await setStarter(db, res.id, rel, 'breizh')
        starters++
      }
    }
    if (!res.created) { skipped++; continue }
    created++
    createdRefs.add(d.id)

    const seen = new Set<string>()
    const videos = [...d.videosAide, ...d.videosComplementaires].flatMap((v) => {
      const youtubeId = tutos.get(v.id)?.youtubeId ?? parseYoutubeId(v.youtube)
      if (!youtubeId || seen.has(youtubeId)) return []
      seen.add(youtubeId)
      return [{ title: tutos.get(v.id)?.description ?? formatTitle(v.nom), youtubeId }]
    })
    await replaceHelpVideos(db, res.id, videos)
  }

  let levelEntries = 0
  for (const page of pages) {
    const level = PAGE_LEVEL[page.page]
    if (!level) continue // liste.html : toutes les activités, pas un parcours
    let position = 0
    for (const [sectionIndex, section] of page.sections.entries()) {
      const kind: Section = sectionIndex === 0 ? 'defis' : 'mini-projet'
      for (const entry of [...section.defis].sort((a, b) => a.ordre - b.ordre)) {
        position++
        const activityId = idBySourceRef.get(entry.id)
        if (!activityId || !createdRefs.has(entry.id)) continue // ne jamais réordonner ce que l'admin a pu modifier
        await addToLevel(db, { level, activityId, position, section: kind })
        levelEntries++
      }
    }
  }
  return { created, skipped, levelEntries, starters }
}
