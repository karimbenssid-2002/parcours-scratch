import fs from 'node:fs'
import { createDb } from '@/lib/db/client'
import { safeMessage } from '@/lib/db/safe-message'
import { seedAdmin } from '@/lib/seed/admin'
import { importBreizh } from '@/lib/seed/breizh'

const SITE_BREIZH = 'site breizh'

async function main() {
  const { ADMIN_EMAIL, DATABASE_URL } = process.env
  if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL est requis dans .env.local')
  if (!DATABASE_URL) throw new Error('DATABASE_URL est requis dans .env.local (ex. pglite:data/dev-pg)')
  const db = await createDb(DATABASE_URL) // applique aussi les migrations

  const admin = await seedAdmin(db, { email: ADMIN_EMAIL })
  console.log(`Compte admin : ${admin === 'created' ? 'créé (connexion avec Google, par cette adresse)' : 'déjà présent'}`)

  // Copie locale du site isnbreizh.fr/scratch (facultative) : sans elle, les défis se créent depuis l'espace admin.
  if (!fs.existsSync(SITE_BREIZH)) {
    console.log(`Défis breizh : dossier « ${SITE_BREIZH} » absent, aucun défi importé.`)
    return
  }
  const breizh = await importBreizh(db, { siteDir: SITE_BREIZH, publicDir: 'public/activities' })
  console.log(`Défis breizh : ${breizh.created} importés, ${breizh.skipped} déjà présents, ${breizh.levelEntries} placements par niveau, ${breizh.starters} projets de départ`)
}

// Sortie explicite : la connexion PostgreSQL ouverte garderait le processus en vie.
main().then(() => process.exit(0), (e) => {
  console.error(`Échec du seed : ${safeMessage(e)}`)
  process.exit(1)
})
