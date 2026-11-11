// Lecture du document « Progressions_Defis_Scratch.md » du porteur du projet (remplissage initial des progressions).
import type { Difficulty, ThemeStep } from '@/lib/db/progressions'
import { parseLevel, type Level } from '@/lib/levels'

export type DocItem = { step: ThemeStep; difficulty: Difficulty; why: string; folder: string }
export type DocTheme = { level: Level; title: string; programme: string; intro: string; optional: boolean; items: DocItem[] }

const PROJECTS_TITLE = 'Projets (programmation événementielle)'

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** Lignes de données d'un tableau markdown (ni l'en-tête ni la ligne de séparation). */
function tableRows(lines: string[]): string[][] {
  const rows = lines.filter((l) => l.trim().startsWith('|')).map(cells)
  return rows.slice(2)
}

/** Dernier segment du lien, décodé : « Genially/4eme/4.4%20Le%20…" → « 4.4 Le … ». */
function folderOf(cell: string): string | null {
  const href = /\]\(([^)]+)\)/.exec(cell)?.[1]
  if (!href) return null
  return decodeURIComponent(href.split('/').filter(Boolean).at(-1) ?? '')
}

const difficultyOf = (cell: string): Difficulty => {
  const n = [...cell].filter((c) => c === '★').length
  return n <= 1 ? 1 : n >= 3 ? 3 : 2
}

function stepOf(cell: string): ThemeStep | null {
  const s = cell.toLowerCase().replace('’', "'")
  if (s.startsWith('découvrir')) return 'decouvrir'
  if (s.startsWith("s'entraîner")) return 'entrainer'
  if (s.startsWith('approfondir')) return 'approfondir'
  return null
}

/** Premier paragraphe (texte hors tableau et hors titre) du bloc. */
function firstParagraph(lines: string[]): string {
  const start = lines.findIndex((l) => l.trim() !== '' && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('**Programme**'))
  if (start === -1) return ''
  const end = lines.findIndex((l, i) => i > start && l.trim() === '')
  return lines.slice(start, end === -1 ? undefined : end).join(' ').trim()
}

/** Découpe en sections au niveau de titre donné ; renvoie [titre, lignes du corps]. */
function sections(lines: string[], marker: string): [string, string[]][] {
  const out: [string, string[]][] = []
  for (const line of lines) {
    if (line.startsWith(marker + ' ')) out.push([line.slice(marker.length + 1).trim(), []])
    else out.at(-1)?.[1].push(line)
  }
  return out
}

function coreTheme(heading: string, body: string[]): DocTheme | null {
  const m = /^(\d)e\s+[–-]\s+Thème\s+\d+\s*:\s*(.+)$/.exec(heading)
  const level = m && parseLevel(m[1])
  if (!m || !level) return null
  const programme = body.find((l) => l.startsWith('**Programme**'))?.replace(/^\*\*Programme\*\*\s*:\s*/, '').trim() ?? ''
  const items = tableRows(body).flatMap((r): DocItem[] => {
    const step = stepOf(r[0]); const folder = folderOf(r[1])
    return step && folder ? [{ step, difficulty: difficultyOf(r[2]), why: r[3] ?? '', folder }] : []
  })
  return { level, title: m[2].trim(), programme, intro: firstParagraph(body), optional: false, items }
}

export function parseProgressionDoc(md: string): DocTheme[] {
  const parts = sections(md.replace(/\r\n/g, '\n').split('\n'), '##')
  const part = (n: number) => parts.find(([t]) => t.startsWith(`${n}.`))?.[1] ?? []
  const themes: DocTheme[] = []

  // Partie 4 : un thème par section « #### {n}e – Thème {k} : {titre} ».
  for (const [heading, body] of sections(part(4), '####')) {
    const t = coreTheme(heading, body)
    if (t) themes.push(t)
  }

  // Partie 6 : un thème facultatif « Projets » par classe conseillée, dans l'ordre d'apparition.
  const six = part(6)
  const projects = new Map<Level, DocTheme>()
  for (const r of tableRows(six)) {
    const level = parseLevel(/\d/.exec(r[0])?.[0]); const folder = folderOf(r[1])
    if (!level || !folder) continue
    if (!projects.has(level)) projects.set(level, { level, title: PROJECTS_TITLE, programme: '', intro: firstParagraph(six), optional: true, items: [] })
    projects.get(level)!.items.push({ step: 'approfondir', difficulty: difficultyOf(r[2]), why: r[3] ?? '', folder })
  }
  themes.push(...projects.values())

  // Partie 7 : « Listes » puis « Textes et codage », en 3e, dans l'ordre de la colonne « Ordre ».
  const seven = part(7)
  const intro = firstParagraph(seven.slice(0, Math.max(0, seven.findIndex((l) => l.startsWith('### ')))))
  for (const [title, body] of sections(seven, '###')) {
    const items = tableRows(body)
      .map((r) => ({ order: Number(r[0]), folder: folderOf(r[1]), difficulty: difficultyOf(r[2]), why: r[3] ?? '' }))
      .filter((r): r is typeof r & { folder: string } => r.folder !== null)
      .sort((a, b) => a.order - b.order)
      .map(({ folder, difficulty, why }): DocItem => ({ step: 'approfondir', difficulty, why, folder }))
    themes.push({ level: '3', title, programme: '', intro, optional: true, items })
  }
  return themes
}
