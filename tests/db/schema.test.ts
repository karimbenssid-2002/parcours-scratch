import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { levelLabel, parseLevel } from '@/lib/levels'

describe('schéma', () => {
  it('crée toutes les tables', async () => {
    const db = await testDb()
    const result = await db.execute(sql`select table_name as name from information_schema.tables where table_schema = 'public'`)
    const names = (result as unknown as { rows: { name: string }[] }).rows.map((r) => r.name)
    expect(names.sort()).toEqual([
      'activities', 'activity_autograde', 'activity_help_videos', 'app_settings', 'autograde_jobs', 'autograde_reference_runs', 'autograde_runner_calls', 'autograde_runs', 'autograde_usage',
      'class_activities', 'class_students', 'classes', 'deadline_extensions',
      'late_notices', 'level_activities', 'login_attempts', 'progress', 'push_subscriptions', 'reviews', 'students', 'teacher_requests', 'teachers', 'theme_activities', 'themes',
    ])
  })

  // Sur Supabase, une table de `public` sans RLS est lisible et modifiable avec la clé publique (Data API).
  it('active la sécurité au niveau des lignes (RLS) sur chaque table', async () => {
    const db = await testDb()
    const result = await db.execute(sql`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by c.relname`)
    const sansRls = (result as unknown as { rows: { name: string }[] }).rows.map((r) => r.name)
    expect(sansRls, `tables sans RLS : ${sansRls.join(', ')}`).toEqual([])
  })
})

describe('niveaux', () => {
  it('formate et valide les niveaux', () => {
    expect(levelLabel('4')).toBe('4e')
    expect(parseLevel('3')).toBe('3')
    expect(parseLevel('2')).toBeNull()
    expect(parseLevel(undefined)).toBeNull()
  })
})
