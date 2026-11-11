import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseProgressionDoc } from '@/lib/progressions/doc'

const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'progressions-extrait.md'), 'utf8')

describe('lecture du document de progression', () => {
  const themes = parseProgressionDoc(md)

  it('trouve les thèmes du parcours puis les facultatifs', () => {
    expect(themes.map((t) => [t.level, t.title, t.optional])).toEqual([
      ['4', 'La variable : mémoriser et faire évoluer une valeur', false],
      ['6', 'Projets (programmation événementielle)', true],
      ['4', 'Projets (programmation événementielle)', true],
      ['3', 'Listes', true],
      ['3', 'Textes et codage', true],
    ])
  })

  it('lit le programme, le texte pour le prof et les défis d’un thème', () => {
    const t = themes[0]
    expect(t.programme).toBe('Manipuler une variable (une seule) ; appliquer un programme de calcul à une variable (programme de 4e, fonctions).')
    expect(t.intro).toMatch(/^On introduit la variable par les programmes de calcul/)
    expect(t.items).toHaveLength(4)
    expect(t.items[0]).toEqual({
      step: 'decouvrir', difficulty: 1, folder: '4.4 Le programme du dinosaure',
      why: 'Deux méthodes, même résultat : étape par étape avec une variable, ou en une expression.',
    })
    expect(t.items[1]).toMatchObject({ step: 'entrainer', difficulty: 2, folder: '4.5 Le programme du lama' })
  })

  it('projets : un thème par classe conseillée, étape Approfondir, texte de la partie 6', () => {
    const six = themes[1]
    expect(six.items.map((i) => i.folder)).toEqual(['6.2 Le tableau magique', '6.2 Ma carte animée'])
    expect(six.items[0]).toMatchObject({ step: 'approfondir', difficulty: 1, why: 'Clic sur les lutins et sur le décor.' })
    expect(six.intro).toMatch(/^Ces défis font travailler les événements/)
    expect(six.programme).toBe('')
    expect(themes[2].items.map((i) => i.folder)).toEqual(['5.15 Le Glouton mange les gommes'])
  })

  it('partie 7 : listes dans l’ordre de la colonne « Ordre », noms de dossier décodés', () => {
    expect(themes[3].items.map((i) => i.folder)).toEqual(['3.15 La liste de courses', '3.16 Les cent premiers multiples'])
    expect(themes[3].intro).toMatch(/^Les listes et le traitement de texte/)
    expect(themes[4].items[0]).toMatchObject({ folder: "3.8 L'éditeur de texte", difficulty: 3, step: 'approfondir' })
  })
})
