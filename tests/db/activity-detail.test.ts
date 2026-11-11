import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import {
  addToLevel, getActivityDetail, getStarterPath, replaceHelpVideos, setActivityStatus,
  setStarter, upsertBreizhActivity,
} from '@/lib/db/activities'

describe('détail d’activité', () => {
  it('renvoie l’activité, ses vidéos d’aide ordonnées et ses niveaux', async () => {
    const db = await testDb()
    const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'Le serpent', slug: 'le-serpent', statementYoutubeId: 'BSf_DNWz1i8', thumbnail: null })
    await replaceHelpVideos(db, a.id, [{ title: 'Les costumes', youtubeId: 'aaaaaaaaaaa' }, { title: 'Le stylo', youtubeId: 'bbbbbbbbbbb' }])
    await addToLevel(db, { level: '6', activityId: a.id, position: 1, section: 'defis' })
    await addToLevel(db, { level: '5', activityId: a.id, position: 3, section: 'defis' })
    const d = (await getActivityDetail(db, a.id))!
    expect(d.title).toBe('Le serpent')
    expect(d.helpVideos.map((v) => v.title)).toEqual(['Les costumes', 'Le stylo'])
    expect(d.levels.sort()).toEqual(['5', '6'])
    expect(await getActivityDetail(db, '00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('projet de départ', async () => {
    const db = await testDb()
    const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'A', slug: 'a', statementYoutubeId: null, thumbnail: null })
    const b = await upsertBreizhActivity(db, { sourceRef: 2, title: 'B', slug: 'b', statementYoutubeId: null, thumbnail: null })
    await addToLevel(db, { level: '6', activityId: a.id, position: 1, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: b.id, position: 2, section: 'defis' })
    await setActivityStatus(db, a.id, 'published')
    await setActivityStatus(db, b.id, 'published')
    expect(await getStarterPath(db, a.id)).toBeNull()
    await setStarter(db, a.id, `starters/${a.id}.sb2`, 'breizh')
    expect(await getStarterPath(db, a.id)).toBe(`starters/${a.id}.sb2`)
    expect((await getActivityDetail(db, a.id))?.starterSource).toBe('breizh')
  })
})
