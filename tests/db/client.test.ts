import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, getDb, POSTGRES_APP_OPTIONS } from '@/lib/db/client'

const globalForDb = globalThis as unknown as { __parcoursDb?: unknown }

describe('client de base', () => {
  afterEach(() => {
    delete globalForDb.__parcoursDb
  })

  it('createDb ouvre PGlite en mémoire (chargé à la demande) et applique les migrations', async () => {
    const db = await createDb('pglite:')
    const res = await db.execute(sql`select count(*)::int as n from students`)
    expect(res).toBeTruthy()
  })

  it('getDb ouvre PGlite de façon synchrone', async () => {
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'pglite:'
    try {
      const db = getDb()
      expect(getDb()).toBe(db)
      await db.execute(sql`select 1`)
    } finally {
      process.env.DATABASE_URL = previous
    }
  })

  it('appli en ligne : petit pool par instance, connexions fermées quand elles ne servent plus, échec rapide', () => {
    expect(POSTGRES_APP_OPTIONS).toMatchObject({ prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 })
  })
})
