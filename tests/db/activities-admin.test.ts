import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import {
  createActivity, getActivityDetail, levelOrder, listActivitiesAdmin, removeFromLevel, replaceHelpVideos, setActivityLevels,
  setLevelOrder, updateActivity,
} from '@/lib/db/activities'

describe('activités (admin)', () => {
  it('crée des activités en brouillon avec des slugs distincts pour un même titre', async () => {
    const db = await testDb()
    const a = await createActivity(db, { title: 'Le labyrinthe' })
    const b = await createActivity(db, { title: 'Le labyrinthe' })
    const da = (await getActivityDetail(db, a.id))!
    const dbb = (await getActivityDetail(db, b.id))!
    expect(da).toMatchObject({ status: 'draft', source: 'admin', slug: 'le-labyrinthe' })
    expect(dbb.slug).toBe('le-labyrinthe-2')
  })

  it('deux créations simultanées d’un même titre obtiennent deux slugs distincts', async () => {
    const db = await testDb()
    const [a, b] = await Promise.all([createActivity(db, { title: 'Le labyrinthe' }), createActivity(db, { title: 'Le labyrinthe' })])
    const slugs = [(await getActivityDetail(db, a.id))!.slug, (await getActivityDetail(db, b.id))!.slug]
    expect(slugs.sort()).toEqual(['le-labyrinthe', 'le-labyrinthe-2'])
  })

  it('modifie titre, consigne, vidéo et statut', async () => {
    const db = await testDb()
    const { id } = await createActivity(db, { title: 'Brouillon' })
    await updateActivity(db, id, { title: 'Le serpent', instructions: 'Fais avancer le serpent.', statementYoutubeId: 'BSf_DNWz1i8', status: 'published' })
    expect(await getActivityDetail(db, id)).toMatchObject({ title: 'Le serpent', instructions: 'Fais avancer le serpent.', statementYoutubeId: 'BSf_DNWz1i8', status: 'published' })
  })

  it('niveaux : ajout en fin de liste, retrait avec positions recompactées', async () => {
    const db = await testDb()
    const a = await createActivity(db, { title: 'A' })
    const b = await createActivity(db, { title: 'B' })
    const c = await createActivity(db, { title: 'C' })
    await setActivityLevels(db, a.id, ['6'])
    await setActivityLevels(db, b.id, ['6', '5'])
    await setActivityLevels(db, c.id, ['6'])
    expect((await levelOrder(db, '6')).map((e) => [e.title, e.position])).toEqual([['A', 1], ['B', 2], ['C', 3]])
    await setActivityLevels(db, b.id, ['5'])
    expect((await levelOrder(db, '6')).map((e) => [e.title, e.position])).toEqual([['A', 1], ['C', 2]])
    expect((await getActivityDetail(db, b.id))?.levels).toEqual(['5'])
    await removeFromLevel(db, '6', a.id)
    expect((await levelOrder(db, '6')).map((e) => [e.title, e.position])).toEqual([['C', 1]])
  })

  it("réordonne un niveau, et refuse un ordre qui n'a pas exactement les mêmes activités", async () => {
    const db = await testDb()
    const ids: string[] = []
    for (const t of ['A', 'B', 'C']) {
      const { id } = await createActivity(db, { title: t })
      await setActivityLevels(db, id, ['4'])
      ids.push(id)
    }
    expect(await setLevelOrder(db, '4', [ids[2], ids[0], ids[1]])).toBe(true)
    expect((await levelOrder(db, '4')).map((e) => e.title)).toEqual(['C', 'A', 'B'])
    expect(await setLevelOrder(db, '4', [ids[0], ids[1]])).toBe(false)
    expect(await setLevelOrder(db, '4', [ids[0], ids[0], ids[1]])).toBe(false)
    expect(await setLevelOrder(db, '4', [ids[0], ids[1], ids[2], '00000000-0000-4000-8000-000000000000'])).toBe(false)
    expect((await levelOrder(db, '4')).map((e) => e.title)).toEqual(['C', 'A', 'B'])
  })

  it('liste la bibliothèque avec recherche et filtre de statut', async () => {
    const db = await testDb()
    const a = await createActivity(db, { title: 'Le serpent' })
    await createActivity(db, { title: 'La calculatrice' })
    await updateActivity(db, a.id, { title: 'Le serpent', instructions: null, statementYoutubeId: null, status: 'published' })
    await setActivityLevels(db, a.id, ['6'])
    await replaceHelpVideos(db, a.id, [{ title: 'Aide', youtubeId: 'aaaaaaaaaaa' }])
    expect(await listActivitiesAdmin(db, { q: 'serp' })).toEqual([expect.objectContaining({ title: 'Le serpent', levels: ['6'], helpCount: 1, status: 'published' })])
    expect((await listActivitiesAdmin(db, { status: 'draft' })).map((r) => r.title)).toEqual(['La calculatrice'])
  })

  it('la recherche de titre ignore accents et majuscules (« Écran »)', async () => {
    const db = await testDb()
    await createActivity(db, { title: 'Écran magique' })
    expect((await listActivitiesAdmin(db, { q: 'écran' })).map((r) => r.title)).toEqual(['Écran magique'])
    expect((await listActivitiesAdmin(db, { q: 'ECRAN' })).map((r) => r.title)).toEqual(['Écran magique'])
  })
})
