import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, describe, expect, it } from 'vitest'

// Base déjà en ligne (migrations 0000 à 0002) : la 0003 marque les activités déjà publiées comme annoncées.
const DRIZZLE = path.join(process.cwd(), 'drizzle')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-0003-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function upTo(count: number): string {
  const dir = path.join(tmp, `drizzle-${count}`)
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true })
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta/_journal.json'), 'utf8'))
  const entries = journal.entries.slice(0, count)
  for (const e of entries) fs.copyFileSync(path.join(DRIZZLE, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`))
  fs.writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
  return dir
}

describe('migration 0003 (annonce unique des activités)', () => {
  it('une activité déjà publiée reçoit announced_at, un brouillon non', async () => {
    const client = new PGlite()
    const db = drizzle({ client })
    await migrate(db, { migrationsFolder: upTo(3) })
    const at = '2026-09-01T08:00:00.000Z'
    await client.exec(`
      insert into activities (id, title, slug, status, created_at, updated_at) values
        ('pub', 'Publiée', 'publiee', 'published', '${at}', '${at}'),
        ('brouillon', 'Brouillon', 'brouillon', 'draft', '${at}', '${at}')`)
    await migrate(db, { migrationsFolder: upTo(4) })
    const { rows } = await client.query<{ id: string; announced_at: string | null }>('select id, announced_at from activities order by id')
    expect(rows).toEqual([{ id: 'brouillon', announced_at: null }, { id: 'pub', announced_at: at }])
  })
})
