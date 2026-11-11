import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createClass } from '@/lib/db/classes'
import { createActivity, setActivityLevels, setActivityStatus } from '@/lib/db/activities'
import { addAssignments, listClassAssignments } from '@/lib/db/assignments'
import { activities } from '@/lib/db/schema'
import {
  addToTheme, createTheme, deleteTheme, listProgression, removeFromTheme, setThemeItemOrder, setThemeOrder, updateTheme, updateThemeItem,
} from '@/lib/db/progressions'

async function setup() {
  const db = await testDb()
  const make = async (title: string, status: 'draft' | 'published' = 'published') => {
    const { id } = await createActivity(db, { title })
    await setActivityStatus(db, id, status)
    return id
  }
  return { db, make }
}

const item = (step: 'decouvrir' | 'entrainer' | 'approfondir', difficulty: 1 | 2 | 3 = 1, why = '') => ({ step, difficulty, why })

describe('progressions', () => {
  it('ordonne les thèmes (facultatifs à la fin) et les défis par étape puis position', async () => {
    const { db, make } = await setup()
    const a = await createTheme(db, { level: '4', title: 'A', optional: true })
    const b = await createTheme(db, { level: '4', title: 'B' })
    await createTheme(db, { level: '4', title: 'C' })
    const x = await make('X'); const y = await make('Y'); const z = await make('Z')
    await addToTheme(db, b.id, x, item('approfondir', 3))
    await addToTheme(db, b.id, y, item('decouvrir'))
    await addToTheme(db, b.id, z, item('entrainer', 2, 'Parce que.'))
    await addToTheme(db, a.id, x, item('decouvrir'))
    const themes = await listProgression(db, '4')
    expect(themes.map((t) => t.title)).toEqual(['B', 'C', 'A'])
    expect(themes[0].items.map((i) => i.title)).toEqual(['Y', 'Z', 'X'])
    expect(themes[0].items[1]).toMatchObject({ step: 'entrainer', difficulty: 2, why: 'Parce que.', status: 'published' })
  })

  it('publishedOnly retire les brouillons et les thèmes vides', async () => {
    const { db, make } = await setup()
    const t = await createTheme(db, { level: '4', title: 'Brouillons' })
    await addToTheme(db, t.id, await make('Pas prêt', 'draft'), item('decouvrir'))
    expect((await listProgression(db, '4')).map((th) => th.title)).toEqual(['Brouillons'])
    expect(await listProgression(db, '4', { publishedOnly: true })).toEqual([])
  })

  it('un défi n’est qu’une fois par thème, mais peut être dans deux thèmes de deux niveaux', async () => {
    const { db, make } = await setup()
    const d = await make('Le double')
    const t6 = await createTheme(db, { level: '6', title: 'Six' })
    const t5 = await createTheme(db, { level: '5', title: 'Cinq' })
    expect(await addToTheme(db, t6.id, d, item('decouvrir'))).toBe(true)
    expect(await addToTheme(db, t6.id, d, item('entrainer'))).toBe(false)
    expect(await addToTheme(db, t5.id, d, item('approfondir'))).toBe(true)
    expect((await listProgression(db, '6'))[0].items.map((i) => i.activityId)).toEqual([d])
    expect((await listProgression(db, '5'))[0].items).toMatchObject([{ activityId: d, step: 'approfondir' }])
  })

  it('item.levels reflète les niveaux du défi', async () => {
    const { db, make } = await setup()
    const d = await make('Les trois tirets')
    await setActivityLevels(db, d, ['3'])
    const t = await createTheme(db, { level: '4', title: 'La variable' })
    await addToTheme(db, t.id, d, item('entrainer'))
    expect((await listProgression(db, '4'))[0].items[0].levels).toEqual(['3'])
  })

  it('setThemeOrder et setThemeItemOrder refusent une liste incomplète ou étrangère', async () => {
    const { db, make } = await setup()
    const a = await createTheme(db, { level: '5', title: 'A' })
    const b = await createTheme(db, { level: '5', title: 'B' })
    const other = await createTheme(db, { level: '6', title: 'Autre' })
    expect(await setThemeOrder(db, '5', [b.id])).toBe(false)
    expect(await setThemeOrder(db, '5', [b.id, other.id])).toBe(false)
    expect(await setThemeOrder(db, '5', [b.id, b.id])).toBe(false)
    expect((await listProgression(db, '5')).map((t) => t.title)).toEqual(['A', 'B'])
    expect(await setThemeOrder(db, '5', [b.id, a.id])).toBe(true)
    expect((await listProgression(db, '5')).map((t) => t.title)).toEqual(['B', 'A'])

    const x = await make('X'); const y = await make('Y')
    await addToTheme(db, a.id, x, item('decouvrir'))
    await addToTheme(db, a.id, y, item('decouvrir'))
    expect(await setThemeItemOrder(db, a.id, [y])).toBe(false)
    expect(await setThemeItemOrder(db, a.id, [y, x, x])).toBe(false)
    expect((await listProgression(db, '5'))[1].items.map((i) => i.title)).toEqual(['X', 'Y'])
    expect(await setThemeItemOrder(db, a.id, [y, x])).toBe(true)
    expect((await listProgression(db, '5'))[1].items.map((i) => i.title)).toEqual(['Y', 'X'])
  })

  it('modifie un thème et un défi de thème, retire un défi', async () => {
    const { db, make } = await setup()
    const t = await createTheme(db, { level: '3', title: 'Avant' })
    const x = await make('X'); const y = await make('Y')
    await addToTheme(db, t.id, x, item('decouvrir'))
    await addToTheme(db, t.id, y, item('decouvrir'))
    await updateTheme(db, t.id, { title: 'Après', programme: 'Prog', intro: 'Texte', optional: true })
    await updateThemeItem(db, t.id, x, item('approfondir', 3, 'Pourquoi'))
    await removeFromTheme(db, t.id, y)
    const [theme] = await listProgression(db, '3')
    expect(theme).toMatchObject({ title: 'Après', programme: 'Prog', intro: 'Texte', optional: true })
    expect(theme.items).toMatchObject([{ activityId: x, step: 'approfondir', difficulty: 3, why: 'Pourquoi' }])
  })

  it('supprimer un thème ne retire rien des classes, supprimer une activité la retire de ses thèmes', async () => {
    const { db, make } = await setup()
    const prof = await createTeacher(db, { email: 'p@malraux-rabat.org', username: 'p', firstName: 'P', lastName: 'P', passwordHash: 'h', role: 'prof' })
    const c = await createClass(db, prof.id, { name: '4e A', level: '4' })
    const x = await make('X'); const y = await make('Y')
    const t1 = await createTheme(db, { level: '4', title: 'Un' })
    const t2 = await createTheme(db, { level: '4', title: 'Deux' })
    const t3 = await createTheme(db, { level: '4', title: 'Trois' })
    await addToTheme(db, t1.id, x, item('decouvrir'))
    await addToTheme(db, t2.id, y, item('decouvrir'))
    await addAssignments(db, c.id, [x])
    await deleteTheme(db, t1.id)
    expect((await listClassAssignments(db, c.id)).map((a) => a.activityId)).toEqual([x])
    // positions recompactées : un réordonnement des thèmes restants fonctionne
    expect(await setThemeOrder(db, '4', [t3.id, t2.id])).toBe(true)
    await db.delete(activities).where(eq(activities.id, y))
    expect((await listProgression(db, '4')).find((t) => t.id === t2.id)?.items).toEqual([])
  })

  it('ajouter à un thème supprimé entre-temps renvoie false sans erreur', async () => {
    const { db, make } = await setup()
    const t = await createTheme(db, { level: '6', title: 'Éphémère' })
    await deleteTheme(db, t.id)
    expect(await addToTheme(db, t.id, await make('X'), item('decouvrir'))).toBe(false)
  })
})
