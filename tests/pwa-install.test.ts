import { describe, expect, it } from 'vitest'
import { detectPlatform, later, markInstalled, shouldOffer } from '@/lib/pwa/install'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('detectPlatform', () => {
  it('reconnaît iPhone et iPad, même l’iPad qui se présente comme un Mac', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('ios')
  })
  it('Android et un Mac sans écran tactile suivent la voie Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile', 5)).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('android')
  })
})

describe('« Plus tard »', () => {
  it('masque la proposition pour cette ouverture seulement : elle revient à la suivante', () => {
    const local = memory(), session = memory()
    expect(shouldOffer(local, session, 0)).toBe(true)
    later(session)
    expect(shouldOffer(local, session, 0)).toBe(false)
    expect(shouldOffer(local, memory(), 0)).toBe(true) // nouvelle ouverture : nouvelle session
  })
  it('un stockage indisponible ne bloque pas la proposition', () => {
    const broken = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } }
    expect(shouldOffer(broken, broken, 0)).toBe(true)
    expect(() => later(broken)).not.toThrow()
    expect(() => markInstalled(broken, 0)).not.toThrow()
  })
})

describe('appli installée', () => {
  it('n’est plus proposée en revenant par le navigateur (pendant un an)', () => {
    const local = memory()
    const t0 = Date.parse('2026-11-08T10:00:00Z')
    markInstalled(local, t0)
    expect(shouldOffer(local, memory(), t0 + 300 * 86_400_000)).toBe(false)
    expect(shouldOffer(local, memory(), t0 + 366 * 86_400_000)).toBe(true)
  })
})
