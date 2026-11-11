import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { addToLevel, listPublishedParcours, setActivityStatus, upsertBreizhActivity } from '@/lib/db/activities'

const act = (n: number) => ({ sourceRef: n, title: `Défi ${n}`, slug: `defi-${n}`, statementYoutubeId: null, thumbnail: null })

describe('activités', () => {
  it("n'affiche que les activités publiées du niveau, dans l'ordre, numérotées", async () => {
    const db = await testDb()
    const a = await upsertBreizhActivity(db, act(1))
    const b = await upsertBreizhActivity(db, act(2))
    const c = await upsertBreizhActivity(db, act(3))
    await addToLevel(db, { level: '6', activityId: b.id, position: 2, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: a.id, position: 1, section: 'defis' })
    await addToLevel(db, { level: '6', activityId: c.id, position: 3, section: 'defis' })
    await addToLevel(db, { level: '5', activityId: a.id, position: 1, section: 'defis' })
    await setActivityStatus(db, a.id, 'published')
    await setActivityStatus(db, c.id, 'published')

    const items = await listPublishedParcours(db, '6')
    expect(items.map((i) => [i.title, i.number])).toEqual([['Défi 1', 1], ['Défi 3', 2]])
    expect(await listPublishedParcours(db, '4')).toEqual([])
  })

  it("l'upsert breizh est idempotent", async () => {
    const db = await testDb()
    const first = await upsertBreizhActivity(db, act(7))
    const again = await upsertBreizhActivity(db, { ...act(7), title: 'Autre titre' })
    expect(first.created).toBe(true)
    expect(again).toEqual({ id: first.id, created: false })
  })
})
