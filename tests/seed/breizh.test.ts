import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { formatTitle, importBreizh, slugify } from '@/lib/seed/breizh'
import { activities, activityHelpVideos, levelActivities } from '@/lib/db/schema'
import { setStarter } from '@/lib/db/activities'

const siteDir = path.join(process.cwd(), 'site breizh')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'breizh-'))

describe('formatTitle / slugify', () => {
  it.each([
    ['leSerpent', 'Le serpent'],
    ['leSerpent2', 'Le serpent 2'],
    ['circuitMW', 'Circuit MW'],
    ['4Square', '4 square'],
    ['codageDeCesar', 'Codage de cesar'],
  ])('%s → %s', (nom, titre) => expect(formatTitle(nom)).toBe(titre))

  it('produit un slug', () => expect(slugify('Le serpent 2')).toBe('le-serpent-2'))
})

// La copie locale du site (« site breizh ») n'est pas publiée avec le code : sans elle, ces tests sont ignorés.
describe.skipIf(!fs.existsSync(siteDir))('importBreizh', () => {
  beforeEach(() => {
    process.env.STORAGE_DIR = tmp()
  })

  it('importe 52 activités en brouillon, leurs vidéos d’aide et l’ordre par niveau', async () => {
    const db = await testDb()
    const publicDir = tmp()
    const res = await importBreizh(db, { siteDir, publicDir })
    expect(res.created).toBe(52)

    const all = await db.select().from(activities)
    expect(all).toHaveLength(52)
    expect(all.every((a) => a.status === 'draft' && a.source === 'breizh')).toBe(true)

    const serpent = all.find((a) => a.title === 'Le serpent')!
    expect(serpent.statementYoutubeId).toMatch(/^[A-Za-z0-9_-]{11}$/)
    expect(serpent.thumbnail).toMatch(/^\/activities\/.+\.png$/)
    expect(fs.existsSync(path.join(publicDir, path.basename(serpent.thumbnail!)))).toBe(true)

    const jeMePresente = all.find((a) => a.sourceRef === 1)!
    const help = await db.select().from(activityHelpVideos).where(eq(activityHelpVideos.activityId, jeMePresente.id))
    expect(help.length).toBeGreaterThan(0)
    expect(help[0].title).not.toMatch(/^[a-z]+[A-Z]/) // titre lisible (description), pas le nom technique

    const n6 = await db.select().from(levelActivities).where(eq(levelActivities.level, '6'))
    expect(n6).toHaveLength(4)
    const n3 = await db.select().from(levelActivities).where(eq(levelActivities.level, '3'))
    expect(n3.filter((e) => e.section === 'mini-projet')).toHaveLength(4)
  })

  it('est idempotent et ne modifie pas une activité déjà éditée', async () => {
    const db = await testDb()
    const publicDir = tmp()
    await importBreizh(db, { siteDir, publicDir })
    await db.update(activities).set({ title: 'Titre modifié par l’admin' }).where(eq(activities.sourceRef, 3))
    const again = await importBreizh(db, { siteDir, publicDir })
    expect(again).toMatchObject({ created: 0, skipped: 52 })
    expect(await db.select().from(activities)).toHaveLength(52)
    expect((await db.select().from(activities).where(eq(activities.sourceRef, 3)).limit(1))[0]?.title).toBe('Titre modifié par l’admin')
  })

  it('associe les 6 projets de départ .sb2 sans écraser un projet déjà choisi par l’admin', async () => {
    const db = await testDb()
    const publicDir = tmp()
    const first = await importBreizh(db, { siteDir, publicDir })
    expect(first.starters).toBe(6)
    const serpent = (await db.select().from(activities).where(eq(activities.sourceRef, 3)).limit(1))[0]!
    expect(serpent).toMatchObject({ starterProjectPath: `starters/${serpent.id}.sb2`, starterSource: 'breizh' })
    expect(fs.existsSync(path.join(process.env.STORAGE_DIR!, 'starters', `${serpent.id}.sb2`))).toBe(true)

    await setStarter(db, serpent.id, `starters/${serpent.id}.sb3`, 'upload')
    const again = await importBreizh(db, { siteDir, publicDir })
    expect(again.starters).toBe(0)
    expect((await db.select().from(activities).where(eq(activities.sourceRef, 3)).limit(1))[0]).toMatchObject({ starterSource: 'upload' })
  })
})
