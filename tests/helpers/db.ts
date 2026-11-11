import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { DB } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Une base PGlite par fichier de test (démarrer PostgreSQL en WebAssembly prend plusieurs secondes),
// vidée à chaque appel : les tests d'un fichier s'exécutent l'un après l'autre.
let shared: Promise<{ db: DB; truncate: string }> | undefined

async function open(): Promise<{ db: DB; truncate: string }> {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
  const { rows } = await client.query<{ name: string }>(`select tablename as name from pg_tables where schemaname = 'public'`)
  return { db, truncate: `truncate ${rows.map((r) => `"${r.name}"`).join(', ')} cascade` }
}

/** Base PostgreSQL (PGlite en mémoire) migrée et vide. */
export async function testDb(): Promise<DB> {
  shared ??= open()
  const { db, truncate } = await shared
  await (db as unknown as { $client: PGlite }).$client.exec(truncate)
  return db
}
