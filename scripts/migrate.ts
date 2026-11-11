import { createDb } from '@/lib/db/client'
import { safeMessage } from '@/lib/db/safe-message'

// Applique les migrations de ./drizzle à la base de DATABASE_URL (la base en ligne via .env.production.local),
// après un changement de schéma. Usage : npm run db:migrate
async function main() {
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) throw new Error('DATABASE_URL est requis (dans .env.production.local pour la base en ligne)')
  await createDb(DATABASE_URL)
  console.log('Migrations appliquées.')
}

// Sortie explicite : la connexion PostgreSQL ouverte garderait le processus en vie.
main().then(() => process.exit(0), (e) => {
  console.error(`Échec des migrations : ${safeMessage(e)}`)
  process.exit(1)
})
