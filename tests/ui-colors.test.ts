import { describe, expect, it } from 'vitest'
import { SC, TEXT_PAIRS, scratchColor } from '@/lib/ui/scratch-colors'

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('couleurs Scratch', () => {
  it.each(TEXT_PAIRS)('le texte %s / %s atteint 4,5:1', (bg, text) => {
    expect(contrast(bg, text)).toBeGreaterThanOrEqual(4.5)
  })

  it('le violet « Apparence » ne porte jamais de texte', () => {
    expect(TEXT_PAIRS.some(([bg]) => bg === SC.looks)).toBe(false)
  })

  it('scratchColor cycle sur 6 couleurs, y compris pour 0 et les négatifs', () => {
    expect(scratchColor(1).cls).toBe(scratchColor(7).cls)
    expect(scratchColor(1).cls).not.toBe(scratchColor(2).cls)
    expect(scratchColor(0).cls).toBe(scratchColor(6).cls)
    expect(scratchColor(-1).cls).toBe(scratchColor(5).cls)
  })
})

describe('violet primaire', () => {
  it('le texte violet utilise primary-ink (lisible sur le fond dégradé), pas primary', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
    const offenders: string[] = []
    for (const f of [...walk('app'), ...walk('components')].filter((p) => p.endsWith('.tsx'))) {
      for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
        for (const m of line.matchAll(/className=(?:"|\{`)([^"`]*)/g)) {
          const cls = m[1].split(/\s+/)
          // Les icônes (classes de taille « size-* ») peuvent rester en violet primaire.
          if (cls.includes('text-primary') && !cls.some((c) => c.startsWith('size-'))) offenders.push(`${f}:${i + 1}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('primary-ink atteint 4,5:1 même sur la tache violette du fond', () => {
    expect(contrast('#e3d9ff', SC.brandSh)).toBeGreaterThanOrEqual(4.5)
  })
})
