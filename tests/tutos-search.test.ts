import { describe, expect, it } from 'vitest'
import { groupTutos } from '@/lib/tutos/search'
import { TUTOS, type Tuto } from '@/lib/tutos/catalogue'

const t = (title: string, category: Tuto['category'], summary = ''): Tuto => ({ title, category, summary, youtubeId: 'x'.repeat(11) })
const sample = [t('Répéter', 'Boucles et pauses', 'Répéter une action'), t('Stylo - les bases', 'Stylo', 'Tracer avec le stylo'), t('Si alors', 'Conditions', 'Structure conditionnelle')]

describe('tutos : regroupement et recherche', () => {
  it('regroupe par catégorie dans l’ordre des catégories, sans catégorie vide', () => {
    expect(groupTutos(sample, '').map((g) => g.category)).toEqual(['Stylo', 'Boucles et pauses', 'Conditions'])
  })
  it('cherche sans tenir compte des accents ni de la casse, dans le titre, le résumé et la catégorie', () => {
    expect(groupTutos(sample, 'REPETER').flatMap((g) => g.tutos.map((x) => x.title))).toEqual(['Répéter'])
    expect(groupTutos(sample, 'tracer').flatMap((g) => g.tutos.map((x) => x.title))).toEqual(['Stylo - les bases'])
    expect(groupTutos(sample, 'conditions').flatMap((g) => g.tutos.map((x) => x.title))).toEqual(['Si alors'])
  })
  it('tous les mots de la recherche doivent se trouver', () => {
    expect(groupTutos(sample, 'stylo bases').length).toBe(1)
    expect(groupTutos(sample, 'stylo boucle')).toEqual([])
  })
  it('le catalogue n’a que des vidéos YouTube valides et des titres uniques', () => {
    expect(TUTOS.length).toBeGreaterThan(50)
    expect(TUTOS.every((x) => /^[\w-]{11}$/.test(x.youtubeId))).toBe(true)
    expect(new Set(TUTOS.map((x) => x.title)).size).toBe(TUTOS.length)
  })
})
