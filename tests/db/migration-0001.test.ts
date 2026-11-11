import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, describe, expect, it } from 'vitest'

// Base déjà en ligne : la migration 0001 retire les mots de passe sans toucher aux données (comptes, classes, travaux).
const DRIZZLE = path.join(process.cwd(), 'drizzle')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-0001-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Dossier de migrations limité à 0000 : l'état de la base en ligne avant cette tâche. */
function only0000(): string {
  const dir = path.join(tmp, 'drizzle-0000')
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true })
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta/_journal.json'), 'utf8'))
  const first = journal.entries[0]
  expect(first.tag).toMatch(/^0000_/)
  fs.copyFileSync(path.join(DRIZZLE, `${first.tag}.sql`), path.join(dir, `${first.tag}.sql`))
  fs.writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: [first] }))
  return dir
}

const columns = async (client: PGlite, table: string) =>
  (await client.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]))
    .rows.map((r) => r.c)
const total = async (client: PGlite, table: string) => (await client.query<{ n: number }>(`select count(*)::int as n from "${table}"`)).rows[0].n

describe('migration 0001 (plus aucun mot de passe)', () => {
  it('garde enseignants, élèves, classes, progressions et revues ; retire les colonnes de mot de passe', async () => {
    const client = new PGlite()
    const db = drizzle({ client })
    await migrate(db, { migrationsFolder: only0000() })
    expect(await columns(client, 'teachers')).toContain('password_hash')

    const at = '2026-10-01T08:00:00.000Z'
    await client.exec(`
      insert into teachers (id, email, first_name, last_name, username, password_hash, role, is_active, must_change_password, created_at)
        values ('t1', 'emma.fictive@malraux-rabat.org', 'Emma', 'Fictive', 'emma.fictive', '$2a$10$hash', 'prof', true, true, '${at}');
      insert into students (id, email, first_name, last_name, password_hash, must_change_password, password_reset_by, password_reset_at, created_at)
        values ('s1', 'alice.exemple@malraux-rabat.org', 'Alice', 'Exemple', '$2a$10$hash', true, 't1', '${at}', '${at}');
      insert into classes (id, teacher_id, name, level, created_at) values ('c1', 't1', '6e A', '6', '${at}');
      insert into class_students (class_id, student_email) values ('c1', 'alice.exemple@malraux-rabat.org');
      insert into activities (id, title, slug, created_at, updated_at) values ('a1', 'Défi', 'defi', '${at}', '${at}');
      insert into progress (id, student_id, activity_id, status, updated_at) values ('p1', 's1', 'a1', 'validated', '${at}');
      insert into reviews (id, progress_id, teacher_id, decision, created_at) values ('r1', 'p1', 't1', 'validated', '${at}');
      insert into teacher_requests (id, type, email, status, created_at) values
        ('q1', 'registration', 'chloe.essai@mlfmonde.org', 'pending', '${at}'),
        ('q2', 'reset', 'emma.fictive@malraux-rabat.org', 'pending', '${at}'),
        ('q3', 'reset', 'emma.fictive@malraux-rabat.org', 'approved', '${at}'),
        -- Inscription et réinitialisation en attente pour la même adresse : ne doivent pas bloquer le nouvel index.
        ('q6', 'registration', 'dora.essai@malraux-rabat.org', 'pending', '${at}'),
        ('q7', 'reset', 'dora.essai@malraux-rabat.org', 'pending', '${at}');
    `)

    await migrate(db, { migrationsFolder: DRIZZLE })

    for (const table of ['teachers', 'students', 'classes', 'class_students', 'activities', 'progress', 'reviews']) {
      expect(await total(client, table), table).toBe(1)
    }
    const [t] = (await client.query(`select id, email, username, role, is_active from teachers`)).rows
    expect(t).toEqual({ id: 't1', email: 'emma.fictive@malraux-rabat.org', username: 'emma.fictive', role: 'prof', is_active: true })
    const [s] = (await client.query(`select id, email, first_name from students`)).rows
    expect(s).toEqual({ id: 's1', email: 'alice.exemple@malraux-rabat.org', first_name: 'Alice' })
    expect((await client.query(`select student_id, status from progress`)).rows).toEqual([{ student_id: 's1', status: 'validated' }])
    expect((await client.query(`select progress_id, teacher_id from reviews`)).rows).toEqual([{ progress_id: 'p1', teacher_id: 't1' }])

    for (const c of ['password_hash', 'must_change_password']) expect(await columns(client, 'teachers')).not.toContain(c)
    for (const c of ['password_hash', 'must_change_password', 'password_reset_by', 'password_reset_at']) {
      expect(await columns(client, 'students')).not.toContain(c)
    }
    // Demandes de réinitialisation supprimées, puis la colonne `type` ; les demandes d'inscription restent.
    expect(await columns(client, 'teacher_requests')).not.toContain('type')
    expect((await client.query(`select id from teacher_requests order by id`)).rows).toEqual([{ id: 'q1' }, { id: 'q6' }])

    // Une seule demande en attente par identité (prenom.nom), quel que soit le domaine.
    await expect(client.query(`insert into teacher_requests (id, email, status, created_at)
      values ('q4', 'Chloe.Essai@malraux-rabat.org', 'pending', '${at}')`)).rejects.toThrow(/teacher_requests_one_pending/)
    await client.query(`insert into teacher_requests (id, email, status, created_at) values ('q5', 'chloe.essai@malraux-rabat.org', 'rejected', '${at}')`)

    // La RLS reste active sur les tables touchées.
    const sansRls = (await client.query<{ name: string }>(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows
    expect(sansRls).toEqual([])
    await client.close()
  })
})
