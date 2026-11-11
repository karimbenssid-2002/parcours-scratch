import { describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { listClassAssignments } from '@/lib/db/assignments'
import { addToTheme, createTheme, listProgression, type Theme } from '@/lib/db/progressions'
import { giveProgression, giveThemes, missingPrerequisite, progressionCounts, themeActivityIds } from '@/lib/progressions/give'
import { selectionPrerequisite, themePrerequisite } from '@/lib/progressions/rules'

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'p@malraux-rabat.org', username: 'p', firstName: 'P', lastName: 'P', role: 'prof' })
  const c = await createClass(db, prof.id, { name: '4e A', level: '4' })
  const make = async (title: string, status: 'draft' | 'published' = 'published') => {
    const { id } = await createActivity(db, { title })
    await setActivityStatus(db, id, status)
    return id
  }
  return { db, classId: c.id, make }
}

const titles = async (db: Awaited<ReturnType<typeof testDb>>, classId: string) => (await listClassAssignments(db, classId)).map((a) => a.title)

describe('donner des thèmes', () => {
  it('giveThemes ajoute dans l’ordre des thèmes puis des étapes, sans doublon', async () => {
    const { db, classId, make } = await setup()
    const t1 = await createTheme(db, { level: '4', title: 'Un' })
    const t2 = await createTheme(db, { level: '4', title: 'Deux' })
    const a = await make('A'); const b = await make('B'); const commun = await make('Commun'); const c = await make('C')
    const brouillon = await make('Brouillon', 'draft')
    await addToTheme(db, t1.id, b, { step: 'entrainer', difficulty: 2, why: '' })
    await addToTheme(db, t1.id, a, { step: 'decouvrir', difficulty: 1, why: '' })
    await addToTheme(db, t1.id, commun, { step: 'approfondir', difficulty: 3, why: '' })
    await addToTheme(db, t2.id, commun, { step: 'decouvrir', difficulty: 1, why: '' })
    await addToTheme(db, t2.id, brouillon, { step: 'decouvrir', difficulty: 1, why: '' })
    await addToTheme(db, t2.id, c, { step: 'entrainer', difficulty: 1, why: '' })
    expect(await giveThemes(db, classId, [t1.id, t2.id])).toBe(4)
    expect(await titles(db, classId)).toEqual(['A', 'B', 'Commun', 'C'])
    expect(await giveThemes(db, classId, [t2.id])).toBe(0)
  })

  it('giveProgression ignore les thèmes facultatifs', async () => {
    const { db, classId, make } = await setup()
    const opt = await createTheme(db, { level: '4', title: 'Projets', optional: true })
    const t1 = await createTheme(db, { level: '4', title: 'Un' })
    await addToTheme(db, opt.id, await make('Projet'), { step: 'approfondir', difficulty: 3, why: '' })
    await addToTheme(db, t1.id, await make('Défi'), { step: 'decouvrir', difficulty: 1, why: '' })
    expect(await giveProgression(db, classId, '4')).toBe(1)
    expect(await titles(db, classId)).toEqual(['Défi'])
  })

  it('themeActivityIds suit l’ordre d’affichage', async () => {
    const { db, make } = await setup()
    const t = await createTheme(db, { level: '4', title: 'Un' })
    const x = await make('X'); const y = await make('Y')
    await addToTheme(db, t.id, x, { step: 'approfondir', difficulty: 1, why: '' })
    await addToTheme(db, t.id, y, { step: 'decouvrir', difficulty: 1, why: '' })
    expect(themeActivityIds((await listProgression(db, '4'))[0])).toEqual([y, x])
  })
})

const theme = (id: string, ids: string[], optional = false): Theme => ({
  id, level: '4', title: `Thème ${id}`, programme: '', intro: '', optional,
  items: ids.map((activityId) => ({ activityId, title: activityId, status: 'published', levels: ['4'], step: 'decouvrir', difficulty: 1, why: '' })),
})

describe('notions pas encore vues', () => {
  const themes = [theme('t1', ['a', 'b']), theme('t2', ['c']), theme('t3', ['d']), theme('opt', ['e'], true)]

  it('renvoie le premier thème précédent sans défi donné', () => {
    expect(missingPrerequisite(themes, new Set(), 't3')).toEqual({ number: 1, title: 'Thème t1' })
    expect(missingPrerequisite(themes, new Set(['b']), 't3')).toEqual({ number: 2, title: 'Thème t2' })
    expect(missingPrerequisite(themes, new Set(['b', 'c']), 't3')).toBeNull()
  })

  it('rien pour le premier thème ni pour un thème facultatif', () => {
    expect(missingPrerequisite(themes, new Set(), 't1')).toBeNull()
    expect(missingPrerequisite(themes, new Set(), 'opt')).toBeNull()
  })

  it('un thème facultatif ne compte pas comme prérequis et ne décale pas les numéros', () => {
    const mixed = [theme('t1', ['a']), theme('opt', ['e'], true), theme('t2', ['c'])]
    expect(missingPrerequisite([mixed[1], mixed[0], mixed[2]], new Set(['a']), 't2')).toBeNull()
    expect(missingPrerequisite([mixed[1], mixed[0], mixed[2]], new Set(), 't2')).toEqual({ number: 1, title: 'Thème t1' })
  })

  it('progressionCounts compte les défis distincts des thèmes non facultatifs', () => {
    expect(progressionCounts([theme('t1', ['a', 'b']), theme('t2', ['b', 'c']), theme('opt', ['z'], true)])).toEqual({ themes: 2, defis: 3 })
  })
})

describe('avertissement selon le niveau de la classe', () => {
  const at = (level: '6' | '5' | '4' | '3', id: string, ids: string[]): Theme => ({ ...theme(id, ids), level })
  const progressions = {
    '6': [at('6', 's1', ['a']), at('6', 's2', ['b'])],
    '5': [at('5', 'c1', ['c']), at('5', 'c2', ['d'])],
    '4': [], '3': [at('3', 't1', ['e']), at('3', 't2', ['f'])],
  }

  it('prévient seulement dans la progression du niveau de la classe', () => {
    expect(themePrerequisite(progressions, '3', '3', new Set(), 't2')).toEqual({ number: 1, title: 'Thème t1' })
    expect(themePrerequisite(progressions, '3', '5', new Set(), 'c2')).toBeNull()
  })

  it('une sélection ne prévient que pour les défis de la progression de la classe', () => {
    expect(selectionPrerequisite(progressions, '3', new Set(), ['d'])).toBeNull()
    expect(selectionPrerequisite(progressions, '3', new Set(), ['d', 'f'])).toEqual({ number: 1, title: 'Thème t1' })
    expect(selectionPrerequisite(progressions, '3', new Set(), ['e', 'f'])).toBeNull()
  })
})
