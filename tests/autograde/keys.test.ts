import { describe, expect, it } from 'vitest'
import { formatKeys, parseKeys } from '@/lib/autograde/keys'

describe('touches de test', () => {
  it('comprend les noms français et anglais, avec ou sans répétition', () => {
    expect(parseKeys('espace × 2, flèche droite x3\nA, entrée')).toEqual({ ok: true, keys: [
      { key: 'space', times: 2 }, { key: 'ArrowRight', times: 3 }, { key: 'a', times: 1 }, { key: 'Enter', times: 1 },
    ] })
    expect(parseKeys('right *2, haut, 7')).toEqual({ ok: true, keys: [{ key: 'ArrowRight', times: 2 }, { key: 'ArrowUp', times: 1 }, { key: '7', times: 1 }] })
    expect(parseKeys('  ')).toEqual({ ok: true, keys: [] })
  })
  it('refuse une touche inconnue ou une répétition hors limites', () => {
    expect(parseKeys('ctrl')).toMatchObject({ ok: false })
    expect(parseKeys('espace × 0')).toMatchObject({ ok: false })
    expect(parseKeys('espace × 21')).toMatchObject({ ok: false })
  })
  it('réécrit les touches enregistrées en français', () => {
    expect(formatKeys([{ key: 'space', times: 2 }, { key: 'ArrowLeft', times: 1 }, { key: 'b', times: 3 }])).toBe('espace × 2, flèche gauche, b × 3')
  })
})
