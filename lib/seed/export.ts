import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getTableColumns, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { DB } from '@/lib/db/client'
import {
  activities, activityAutograde, activityHelpVideos, appSettings, levelActivities, themeActivities, themes,
} from '@/lib/db/schema'
import { thumbnailFile } from '@/lib/activities/thumbnail'
import { seedAdmin } from './admin'

// Export du contenu pédagogique de la base locale (SQLite) vers la base en ligne.
// Liste fermée : seules ces tables sont lues, dans l'ordre des clés étrangères. Aucune ne pointe vers un compte.
// Tout le reste (enseignants, élèves, classes, travaux, corrections, demandes, tentatives…) n'est jamais lu.
const CONTENT: { name: string; table: PgTable; pk: PgColumn[] }[] = [
  { name: 'activities', table: activities, pk: [activities.id] },
  { name: 'activity_help_videos', table: activityHelpVideos, pk: [activityHelpVideos.id] },
  { name: 'level_activities', table: levelActivities, pk: [levelActivities.level, levelActivities.activityId] },
  { name: 'themes', table: themes, pk: [themes.id] },
  { name: 'theme_activities', table: themeActivities, pk: [themeActivities.themeId, themeActivities.activityId] },
  { name: 'activity_autograde', table: activityAutograde, pk: [activityAutograde.activityId] },
  { name: 'app_settings', table: appSettings, pk: [appSettings.key] },
]

export const EXCLUDED_TABLES = [
  'teachers', 'teacher_requests', 'students', 'classes', 'class_students', 'class_activities', 'deadline_extensions',
  'progress', 'reviews', 'late_notices', 'autograde_runs', 'autograde_jobs', 'autograde_usage', 'login_attempts',
]

/** Dossiers de stockage du contenu ; `projets/` (travaux des élèves) n'en fait jamais partie. */
const CONTENT_DIRS = ['starters/', 'solutions/', 'vignettes/']

type Row = Record<string, unknown>
export type ExportSource = { sqliteFile: string; storageDir: string }
export type ExportTarget = { db: DB; write: (rel: string, bytes: Uint8Array) => Promise<void> }
export type ExportPlan = {
  tables: Record<string, number>
  /** Fichiers référencés présents dans le stockage local, à copier. */
  files: string[]
  /** Fichiers référencés absents du stockage local (non copiés). */
  missing: string[]
  /** Vignettes livrées avec le site (/activities/…) : fichiers du dépôt, non copiés ici. */
  staticThumbnails: number
  /** Vignettes d'une autre forme (adresse externe…) : la ligne est copiée telle quelle, aucun fichier. */
  otherThumbnails: string[]
  /** Lignes liées à une activité (ou un thème) absente de la source : non copiées. */
  orphans: string[]
  rows: Map<PgTable, Row[]>
}
export type ExportResult = Omit<ExportPlan, 'files' | 'rows'> & { files: number; admin: 'created' | 'exists' }

/** Chemin de fichier de contenu : refuse les travaux d'élèves et tout ce qui sort des dossiers de contenu. */
function contentPath(rel: string): string {
  if (rel.startsWith('projets/')) throw new Error(`Refusé : ${rel} est un travail d'élève (projets/), jamais exporté.`)
  if (!CONTENT_DIRS.some((d) => rel.startsWith(d)) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`Chemin de fichier invalide pour l'export : ${rel}`)
  }
  return rel
}

/** Lit une table de contenu (colonnes du schéma en ligne seulement) et convertit les valeurs SQLite. */
function readTable(sqlite: Database.Database, name: string, table: PgTable): Row[] {
  const columns = Object.entries(getTableColumns(table))
  const present = new Set((sqlite.prepare(`select name from pragma_table_info(?)`).all(name) as { name: string }[]).map((c) => c.name))
  if (present.size === 0) throw new Error(`Base locale : table ${name} absente.`)
  const absent = columns.map(([, c]) => c.name).filter((c) => !present.has(c))
  if (absent.length) throw new Error(`Base locale : colonne(s) ${absent.join(', ')} absente(s) de la table ${name}.`)
  const list = columns.map(([, c]) => `"${c.name}"`).join(', ')
  const raw = sqlite.prepare(`select ${list} from "${name}"`).all() as Row[]
  return raw.map((r) => Object.fromEntries(columns.map(([key, c]) => {
    const v = r[c.name]
    return [key, c.dataType === 'boolean' && v !== null ? v === 1 : v] // booléens SQLite : 0/1
  })))
}

/** Lit la base locale (lecture seule) et liste ce qui serait copié. N'écrit rien nulle part. */
export async function planExport(source: ExportSource): Promise<ExportPlan> {
  const sqlite = new Database(source.sqliteFile, { readonly: true, fileMustExist: true })
  const rows = new Map<PgTable, Row[]>()
  const tables: Record<string, number> = {}
  try {
    for (const { name, table } of CONTENT) rows.set(table, readTable(sqlite, name, table))
  } finally {
    sqlite.close()
  }

  // Lignes enfants dont l'activité (ou le thème) manque à la source : écartées et listées, plutôt qu'un échec anonyme de clé étrangère.
  const orphans: string[] = []
  const activityIds = new Set(rows.get(activities)!.map((a) => a.id))
  const themeIds = new Set(rows.get(themes)!.map((t) => t.id))
  for (const { name, table } of CONTENT) {
    if (table === activities || table === themes || table === appSettings) continue
    rows.set(table, rows.get(table)!.filter((r) => {
      const why = !activityIds.has(r.activityId) ? `activité ${String(r.activityId)}`
        : table === themeActivities && !themeIds.has(r.themeId) ? `thème ${String(r.themeId)}` : null
      const key = r.id ?? r.themeId ?? r.level // identifiant de la ligne (activity_autograde n'en a pas d'autre que l'activité)
      if (why) orphans.push(`${name}${key === undefined ? '' : ` (${String(key)})`} → ${why} absente de la source`)
      return !why
    }))
  }
  for (const { name, table } of CONTENT) tables[name] = rows.get(table)!.length

  const referenced: string[] = []
  const missing: string[] = []
  const otherThumbnails: string[] = []
  let staticThumbnails = 0
  for (const a of rows.get(activities)! as { starterProjectPath: string | null; thumbnail: string | null }[]) {
    if (a.starterProjectPath) referenced.push(contentPath(a.starterProjectPath))
    if (a.thumbnail) {
      const stored = thumbnailFile(a.thumbnail)
      if (stored) referenced.push(contentPath(stored))
      else if (a.thumbnail.startsWith('/activities/')) staticThumbnails++
      else if (a.thumbnail.startsWith('/api/vignettes/')) missing.push(a.thumbnail) // nom non conforme : introuvable en ligne
      else otherThumbnails.push(a.thumbnail)
    }
  }
  for (const g of rows.get(activityAutograde)! as { solutionPath: string | null }[]) {
    if (g.solutionPath) referenced.push(contentPath(g.solutionPath))
  }

  const files: string[] = []
  for (const rel of new Set(referenced)) (fs.existsSync(path.join(source.storageDir, rel)) ? files : missing).push(rel)
  return { tables, files, missing, staticThumbnails, otherThumbnails, orphans, rows }
}

/** Colonnes hors clé primaire, remplacées par la valeur exportée en cas de conflit. */
function updateSet(table: PgTable, pk: PgColumn[]) {
  const pkNames = new Set(pk.map((c) => c.name))
  return Object.fromEntries(Object.entries(getTableColumns(table))
    .filter(([, c]) => !pkNames.has(c.name))
    .map(([key, c]) => [key, sql.raw(`excluded."${c.name}"`)]))
}

const CHUNK = 500

/**
 * Copie le contenu pédagogique (tables de CONTENT et fichiers qu'elles référencent) vers la cible, puis crée
 * le compte admin s'il n'existe pas (un compte existant n'est jamais modifié). Idempotent ; les lignes
 * supprimées localement depuis un export précédent ne sont pas supprimées en ligne.
 */
export async function exportContent(
  source: ExportSource, target: ExportTarget, opts: { admin: { email: string } },
): Promise<ExportResult> {
  const { rows, files, ...plan } = await planExport(source)

  for (const rel of files) await target.write(rel, new Uint8Array(fs.readFileSync(path.join(source.storageDir, rel))))

  await target.db.transaction(async (tx) => {
    for (const { table, pk } of CONTENT) {
      const all = rows.get(table)!
      const set = updateSet(table, pk)
      for (let i = 0; i < all.length; i += CHUNK) {
        await tx.insert(table).values(all.slice(i, i + CHUNK)).onConflictDoUpdate({ target: pk, set })
      }
    }
  })

  const admin = await seedAdmin(target.db, opts.admin)
  return { ...plan, files: files.length, admin }
}
