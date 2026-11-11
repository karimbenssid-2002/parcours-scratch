import { createDb } from '@/lib/db/client'
import { safeMessage } from '@/lib/db/safe-message'
import { EXCLUDED_TABLES, exportContent, planExport, type ExportPlan } from '@/lib/seed/export'
import { writeStored } from '@/lib/storage/files'

// Copie le contenu pédagogique (défis, progressions (thèmes), corrections automatiques, fichiers associés) de la base
// locale vers la base en ligne. Jamais de compte, d'élève, de classe ni de travail d'élève.
// Usage : npm run export:contenu [-- --dry-run]

/** Cible affichée sans mot de passe. Une adresse illisible donne une erreur neuve : celle de `new URL` contient l'adresse entière. */
function describeTarget(url: string): string {
  if (url.startsWith('pglite:')) return `PGlite local (${url.slice('pglite:'.length) || 'en mémoire'})`
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('DATABASE_URL invalide (encoder les caractères spéciaux du mot de passe : # → %23, / → %2F, ? → %3F, @ → %40).')
  }
  return `PostgreSQL ${u.host}${u.pathname}`
}


function describeStorage(): string {
  if (process.env.STORAGE_BACKEND === 'supabase') return `bucket Supabase (${process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : 'SUPABASE_URL absent'})`
  return `dossier local ${process.env.STORAGE_DIR ?? 'storage'}`
}

const list = (items: string[]) => items.map((m) => `  - ${m}`).join('\n')

function printPlan(plan: Pick<ExportPlan, 'tables' | 'missing' | 'staticThumbnails' | 'otherThumbnails' | 'orphans'>, files: number) {
  for (const [name, n] of Object.entries(plan.tables)) console.log(`  ${name.padEnd(22)}: ${n}`)
  if (plan.orphans.length) console.log(`Lignes écartées, liées à une activité ou un thème absent de la source (${plan.orphans.length}) :\n${list(plan.orphans)}`)
  console.log(`Fichiers copiés : ${files}`)
  console.log(`Vignettes du dépôt (/activities/…, non copiées ici) : ${plan.staticThumbnails}`)
  if (plan.otherThumbnails.length) console.log(`Vignettes d'une autre forme, copiées telles quelles sans fichier (${plan.otherThumbnails.length}) :\n${list(plan.otherThumbnails)}`)
  if (plan.missing.length) console.log(`Fichiers référencés absents du stockage local (${plan.missing.length}) :\n${list(plan.missing)}`)
  else console.log('Fichiers référencés absents : aucun')
  console.log(`Tables jamais exportées : ${EXCLUDED_TABLES.join(', ')}`)
  console.log('Les lignes supprimées en local depuis un export précédent restent en ligne.')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { DATABASE_URL, ADMIN_EMAIL } = process.env
  if (!DATABASE_URL) throw new Error('DATABASE_URL (base cible) est requis.')
  const source = { sqliteFile: process.env.EXPORT_SQLITE_FILE ?? 'data/app.db', storageDir: process.env.EXPORT_STORAGE_DIR ?? 'storage' }
  console.log(`Source : ${source.sqliteFile} (lecture seule), fichiers de ${source.storageDir}`)
  console.log(`Cible  : ${describeTarget(DATABASE_URL)}, fichiers vers ${describeStorage()}`)

  if (dryRun) {
    const plan = await planExport(source)
    console.log('Essai à blanc (--dry-run) :')
    printPlan(plan, plan.files.length)
    console.log('Aucune écriture effectuée.')
    return
  }

  if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL est requis.')
  const db = await createDb(DATABASE_URL) // applique aussi les migrations
  const res = await exportContent(source, { db, write: writeStored }, { admin: { email: ADMIN_EMAIL } })
  console.log('Lignes copiées :')
  printPlan(res, res.files)
  console.log(`Compte admin : ${res.admin === 'created' ? 'créé (connexion avec Google, par cette adresse)' : 'déjà présent, inchangé'}`)
}

main().then(() => process.exit(0), (e) => {
  console.error(`Échec de l'export : ${safeMessage(e)}`)
  process.exit(1)
})
