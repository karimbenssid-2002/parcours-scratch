import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { exportContent, planExport } from '@/lib/seed/export'
import {
  activities, activityAutograde, activityHelpVideos, appSettings, classes, levelActivities, progress, students, teachers, themeActivities, themes,
} from '@/lib/db/schema'

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const VIGNETTE = `${A1}-1700000000000.webp`
const NOW = '2026-01-01T00:00:00.000Z'
const ADMIN = { email: 'admin@exemple.org', password: 'initial-2026' }

/** Base SQLite au format de l'ancienne appli locale : contenu + comptes et travaux d'élèves fictifs. */
function fabricate(): { sqliteFile: string; storageDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-src-'))
  const sqliteFile = path.join(dir, 'app.db')
  const storageDir = path.join(dir, 'storage')
  const db = new Database(sqliteFile)
  db.exec(`
    create table teachers (id text primary key, email text, first_name text, last_name text, username text, password_hash text, role text,
      is_active integer, must_change_password integer, created_at text, last_login_at text);
    create table students (id text primary key, email text, first_name text, last_name text, password_hash text, must_change_password integer, created_at text);
    create table classes (id text primary key, teacher_id text, name text, level text, created_at text);
    create table progress (id text primary key, student_id text, activity_id text, status text, project_path text, updated_at text);
    create table activities (id text primary key, title text, slug text, capytale_url text, capytale_nid text, starter_project_path text,
      statement_youtube_id text, instructions text, thumbnail text, status text, source text, source_ref integer, created_at text, updated_at text, starter_source text);
    create table activity_help_videos (id text primary key, activity_id text, title text, youtube_id text, position integer);
    create table level_activities (level text, activity_id text, position integer, section text);
    create table themes (id text primary key, level text, position integer, title text, programme text, intro text, optional integer, created_at text);
    create table theme_activities (theme_id text, activity_id text, position integer, step text, difficulty integer, why text);
    create table activity_autograde (activity_id text primary key, solution_path text, solution_format text, criteria text, answers text, keys text,
      duration_ms integer, updated_at text);
    create table app_settings (key text primary key, value text);
  `)
  db.prepare(`insert into teachers values ('t1', 'prof@exemple.org', 'Pat', 'Prof', 'pat', 'x', 'prof', 1, 0, ?, null)`).run(NOW)
  db.prepare(`insert into students values ('s1', 'eleve@exemple.org', 'Eli', 'Eleve', 'x', 0, ?)`).run(NOW)
  db.prepare(`insert into classes values ('c1', 't1', '5e A', '5e', ?)`).run(NOW)
  db.prepare(`insert into progress values ('p1', 's1', ?, 'submitted', 'projets/s1/a1.sb3', ?)`).run(A1, NOW)
  const act = db.prepare(`insert into activities values (?, ?, ?, null, null, ?, null, 'Consigne', ?, 'published', 'admin', ?, ?, ?, ?)`)
  act.run(A1, 'Le serpent', 'le-serpent', `starters/${A1}.sb3`, `/api/vignettes/${VIGNETTE}`, 1, NOW, NOW, 'upload')
  act.run(A2, 'Pong', 'pong', `starters/${A2}.sb3`, '/activities/pong.png', null, NOW, NOW, null)
  db.prepare(`insert into activity_help_videos values ('v1', ?, 'Aide', 'abcdefghijk', 0)`).run(A1)
  db.prepare(`insert into level_activities values ('5e', ?, 0, 'defis')`).run(A1)
  db.prepare(`insert into themes values ('th1', '5e', 0, 'Boucles', '', '', 1, ?)`).run(NOW)
  db.prepare(`insert into theme_activities values ('th1', ?, 0, 'decouvrir', 2, 'Pour commencer')`).run(A1)
  db.prepare(`insert into activity_autograde values (?, ?, 'sb3', '["c"]', '[]', '[]', 5000, ?)`).run(A1, `solutions/${A1}.sb3`, NOW)
  db.prepare(`insert into app_settings values ('reglage', 'valeur')`).run()
  db.close()

  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(storageDir, rel)), { recursive: true })
    fs.writeFileSync(path.join(storageDir, rel), text)
  }
  put(`starters/${A1}.sb3`, 'depart-1')
  // starters/<A2>.sb3 manquant : signalé, sans arrêter l'export
  put(`solutions/${A1}.sb3`, 'solution-1')
  put(`vignettes/${VIGNETTE}`, 'image')
  put('starters/orphelin.sb3', 'non référencé')
  put('projets/s1/a1.sb3', 'travail élève')
  return { sqliteFile, storageDir }
}

function memoryWrite() {
  const written = new Map<string, string>()
  return { written, write: async (rel: string, bytes: Uint8Array) => { written.set(rel, Buffer.from(bytes).toString()) } }
}

describe('exportContent', () => {
  let source: { sqliteFile: string; storageDir: string }
  beforeEach(() => { source = fabricate() })

  it('copie le contenu et ses fichiers référencés, jamais les comptes ni les travaux', async () => {
    const db = await testDb()
    const { written, write } = memoryWrite()
    const res = await exportContent(source, { db, write }, { admin: ADMIN })

    expect(res.tables).toEqual({
      activities: 2, activity_help_videos: 1, level_activities: 1, themes: 1, theme_activities: 1, activity_autograde: 1, app_settings: 1,
    })
    expect(res.files).toBe(3)
    expect(res.missing).toEqual([`starters/${A2}.sb3`])
    expect(res.staticThumbnails).toBe(1)
    expect(res.admin).toBe('created')

    expect([...written.keys()].sort()).toEqual([`solutions/${A1}.sb3`, `starters/${A1}.sb3`, `vignettes/${VIGNETTE}`])
    expect(written.get(`starters/${A1}.sb3`)).toBe('depart-1')

    expect(await db.select().from(activities)).toHaveLength(2)
    expect(await db.select().from(students)).toHaveLength(0)
    expect(await db.select().from(progress)).toHaveLength(0)
    expect(await db.select().from(classes)).toHaveLength(0)
    const profs = await db.select().from(teachers)
    expect(profs).toHaveLength(1)
    expect(profs[0]).toMatchObject({ email: ADMIN.email, role: 'admin', mustChangePassword: true })

    // Valeurs converties : booléen SQLite 0/1, entier, null conservé.
    expect((await db.select().from(themes))[0]).toMatchObject({ id: 'th1', optional: true, createdAt: NOW })
    expect(await db.select().from(activities)).toContainEqual(expect.objectContaining({ id: A2, sourceRef: null, starterSource: null, thumbnail: '/activities/pong.png' }))
    expect((await db.select().from(activityAutograde))[0]).toMatchObject({ activityId: A1, durationMs: 5000, criteria: '["c"]' })
    expect(await db.select().from(activityHelpVideos)).toHaveLength(1)
    expect(await db.select().from(levelActivities)).toHaveLength(1)
    expect((await db.select().from(themeActivities))[0]).toMatchObject({ difficulty: 2, why: 'Pour commencer' })
    expect(await db.select().from(appSettings)).toEqual([{ key: 'reglage', value: 'valeur' }])
  })

  it("mot de passe admin refusé (valeur d'exemple, trop court) : échec avant toute copie", async () => {
    const db = await testDb()
    for (const password of ['changer-moi-2026', 'court-2026']) {
      const { written, write } = memoryWrite()
      await expect(exportContent(source, { db, write }, { admin: { ...ADMIN, password } })).rejects.toThrow(/ADMIN_INITIAL_PASSWORD/)
      expect(written.size).toBe(0)
      expect(await db.select().from(activities)).toHaveLength(0)
      expect(await db.select().from(teachers)).toHaveLength(0)
    }
  })

  it('un 2e export met le contenu à jour sans toucher au compte admin', async () => {
    const db = await testDb()
    await exportContent(source, { db, write: memoryWrite().write }, { admin: ADMIN })
    const [before] = await db.select().from(teachers)
    // L'admin a changé son mot de passe en ligne entre-temps.
    await db.update(teachers).set({ passwordHash: 'nouveau', mustChangePassword: false })

    const local = new Database(source.sqliteFile)
    local.prepare(`update activities set title = 'Le serpent (v2)' where id = ?`).run(A1)
    local.close()

    const res = await exportContent(source, { db, write: memoryWrite().write }, { admin: { ...ADMIN, password: 'autre' } })
    expect(res.admin).toBe('exists')
    expect(await db.select().from(teachers)).toEqual([{ ...before, passwordHash: 'nouveau', mustChangePassword: false }])
    expect(await db.select().from(activities)).toHaveLength(2)
    expect(await db.select().from(activities)).toContainEqual(expect.objectContaining({ id: A1, title: 'Le serpent (v2)' }))
  })

  it('refuse un fichier de travaux d’élèves (projets/) référencé par une activité', async () => {
    const local = new Database(source.sqliteFile)
    local.prepare(`update activities set starter_project_path = 'projets/s1/a1.sb3' where id = ?`).run(A1)
    local.close()
    const db = await testDb()
    const { written, write } = memoryWrite()
    await expect(exportContent(source, { db, write }, { admin: ADMIN })).rejects.toThrow(/projets/)
    expect(written.size).toBe(0)
    expect(await db.select().from(activities)).toHaveLength(0)
    expect(await db.select().from(teachers)).toHaveLength(0)
  })

  it('écarte et liste les lignes liées à une activité ou un thème absent, sans copier leurs fichiers', async () => {
    const GHOST = '33333333-3333-4333-8333-333333333333'
    const local = new Database(source.sqliteFile)
    local.prepare(`insert into activity_help_videos values ('v-orphelin', ?, 'Aide', 'abcdefghijk', 1)`).run(GHOST)
    local.prepare(`insert into level_activities values ('4e', ?, 0, 'defis')`).run(GHOST)
    local.prepare(`insert into theme_activities values ('th-absent', ?, 1, 'entrainer', 1, '')`).run(A2)
    local.prepare(`insert into activity_autograde values (?, ?, 'sb3', '[]', '[]', '[]', 5000, ?)`).run(GHOST, `solutions/${GHOST}.sb3`, NOW)
    local.close()
    const db = await testDb()
    const { written, write } = memoryWrite()
    const res = await exportContent(source, { db, write }, { admin: ADMIN })
    expect(res.orphans).toEqual([
      `activity_help_videos (v-orphelin) → activité ${GHOST} absente de la source`,
      `level_activities (4e) → activité ${GHOST} absente de la source`,
      'theme_activities (th-absent) → thème th-absent absente de la source',
      `activity_autograde → activité ${GHOST} absente de la source`,
    ])
    expect(res.tables).toMatchObject({ activity_help_videos: 1, level_activities: 1, theme_activities: 1, activity_autograde: 1 })
    expect(res.missing).not.toContain(`solutions/${GHOST}.sb3`)
    expect(written.has(`solutions/${GHOST}.sb3`)).toBe(false)
    expect(await db.select().from(activityAutograde)).toHaveLength(1)
  })

  it('signale les vignettes d’une autre forme', async () => {
    const local = new Database(source.sqliteFile)
    local.prepare(`update activities set thumbnail = 'https://exemple.org/image.png' where id = ?`).run(A2)
    local.close()
    const plan = await planExport(source)
    expect(plan.otherThumbnails).toEqual(['https://exemple.org/image.png'])
    expect(plan.staticThumbnails).toBe(0)
  })

  it('nomme la table quand une colonne manque dans la base locale', async () => {
    const local = new Database(source.sqliteFile)
    local.exec('alter table themes drop column intro')
    local.close()
    await expect(planExport(source)).rejects.toThrow('colonne(s) intro absente(s) de la table themes')
  })

  it('refuse un chemin hors des dossiers de contenu', async () => {
    const local = new Database(source.sqliteFile)
    local.prepare(`update activity_autograde set solution_path = 'starters/../projets/x.sb3'`).run()
    local.close()
    await expect(planExport(source)).rejects.toThrow(/invalide/)
  })
})

describe('planExport (--dry-run)', () => {
  it('lit et compte sans rien écrire, ni en cible ni dans la source', async () => {
    const source = fabricate()
    const stamp = () => fs.statSync(source.sqliteFile).mtimeMs
    const before = stamp()
    const plan = await planExport(source)
    expect(plan.tables.activities).toBe(2)
    expect([...plan.files].sort()).toEqual([`solutions/${A1}.sb3`, `starters/${A1}.sb3`, `vignettes/${VIGNETTE}`])
    expect(plan.missing).toEqual([`starters/${A2}.sb3`])
    expect(stamp()).toBe(before)
  })

  it('le script en --dry-run n’ouvre pas la base cible', async () => {
    const source = fabricate()
    const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'export-cible-')), 'pg')
    const { stdout } = await promisify(execFile)(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/export-contenu.ts', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: `pglite:${target}`, EXPORT_SQLITE_FILE: source.sqliteFile, EXPORT_STORAGE_DIR: source.storageDir },
    })
    expect(stdout).toMatch(/activities\s*: 2/)
    expect(stdout).toMatch(/Aucune écriture/)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('n’affiche jamais le mot de passe d’une DATABASE_URL illisible', async () => {
    const source = fabricate()
    const run = promisify(execFile)(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/export-contenu.ts', '--dry-run'], {
      encoding: 'utf8',
      env: {
        ...process.env, DATABASE_URL: 'postgresql://postgres:Mdp#Secret/42@db.exemple.invalid:5432/postgres',
        EXPORT_SQLITE_FILE: source.sqliteFile, EXPORT_STORAGE_DIR: source.storageDir,
      },
    })
    const err = await run.then(() => null, (e: { code: number; stdout: string; stderr: string }) => e)
    expect(err?.code).toBe(1)
    expect(err!.stderr).toMatch(/DATABASE_URL invalide/)
    expect(err!.stdout + err!.stderr).not.toMatch(/Secret/)
  })
})
