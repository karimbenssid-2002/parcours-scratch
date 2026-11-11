import fs from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import postgres from 'postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import * as schema from './schema'

/** Base PostgreSQL : Supabase en ligne (postgres-js), PGlite en local et en test. */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>

const PGLITE = 'pglite:'
const migrationsFolder = () => path.join(process.cwd(), 'drizzle')

/* PGlite (PostgreSQL en WebAssembly, une vingtaine de Mo) n'est chargé qu'à la demande : il ne sert qu'en local
 * et en test, et next.config.ts l'écarte du code serveur déployé. `getDb()` restant synchrone, c'est un `require`. */
type PgliteModules = {
  PGlite: typeof PGlite
  drizzle: typeof import('drizzle-orm/pglite').drizzle
  migrate: typeof import('drizzle-orm/pglite/migrator').migrate
}
function loadPglite(): PgliteModules {
  /* eslint-disable @typescript-eslint/no-require-imports */
  return {
    PGlite: require('@electric-sql/pglite').PGlite,
    drizzle: require('drizzle-orm/pglite').drizzle,
    migrate: require('drizzle-orm/pglite/migrator').migrate,
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/** PGlite dans un dossier (`pglite:data/dev-pg`) ou en mémoire (`pglite:`) : pas besoin d'installer PostgreSQL. */
function openPglite(url: string, pg: PgliteModules) {
  const dir = url.slice(PGLITE.length)
  if (dir) fs.mkdirSync(dir, { recursive: true })
  return pg.drizzle({ client: new pg.PGlite(dir || undefined), schema })
}

/** Options postgres-js. `prepare: false` : obligatoire derrière le pooler Supabase en mode transaction.
 * Pour l'appli : une instance Vercel (Fluid compute) sert plusieurs requêtes à la fois, d'où un petit pool (5), moins que
 * le défaut (10) pour que plusieurs instances chaudes n'épuisent pas les connexions du pooler ; les connexions inutilisées
 * sont fermées après 20 s, et une base en pause (offre gratuite) échoue en 10 s au lieu de bloquer la requête.
 * Les scripts gardent le défaut. */
export const POSTGRES_APP_OPTIONS = { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 } as const
const POSTGRES_SCRIPT_OPTIONS = { prepare: false } as const

const openPostgres = (url: string, options: postgres.Options<Record<string, never>>) =>
  drizzlePostgres({ client: postgres(url, options), schema })

/** Ouvre la base et applique les migrations de ./drizzle (tests, seed, scripts). */
export async function createDb(url: string): Promise<DB> {
  if (url.startsWith(PGLITE)) {
    const pg = loadPglite()
    const db = openPglite(url, pg)
    await pg.migrate(db, { migrationsFolder: migrationsFolder() })
    return db
  }
  const db = openPostgres(url, POSTGRES_SCRIPT_OPTIONS)
  await migratePostgres(db, { migrationsFolder: migrationsFolder() })
  return db
}

/** Violation d'une contrainte UNIQUE (code PostgreSQL 23505), que drizzle enveloppe dans `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  for (let err = e; err instanceof Error; err = err.cause) {
    if ((err as { code?: unknown }).code === '23505') return true
  }
  return false
}

// Cache global : évite d'ouvrir une connexion par rechargement à chaud en dev.
const globalForDb = globalThis as unknown as { __parcoursDb?: DB }

/** Base de l'appli (DATABASE_URL), sans migration : elles sont appliquées à part (Supabase ; `npm run seed` en local). */
export function getDb(): DB {
  if (!globalForDb.__parcoursDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL est requis (ex. pglite:data/dev-pg en local)')
    globalForDb.__parcoursDb = url.startsWith(PGLITE) ? openPglite(url, loadPglite()) : openPostgres(url, POSTGRES_APP_OPTIONS)
  }
  return globalForDb.__parcoursDb
}
