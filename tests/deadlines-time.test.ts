import { describe, expect, it } from 'vitest'
import { now, setClockOffset } from '@/lib/clock'
import { formatDue, formatRemaining, parseSchoolDateTime, toSchoolInput } from '@/lib/deadlines/time'

describe('heure du Maroc', () => {
  it('convertit une saisie en UTC (UTC+1 hors ramadan)', () => {
    expect(parseSchoolDateTime('2026-10-14T18:00')).toBe('2026-10-14T17:00:00.000Z')
  })
  it('convertit une saisie en UTC pendant le ramadan (UTC+0)', () => {
    expect(parseSchoolDateTime('2026-03-01T18:00')).toBe('2026-03-01T18:00:00.000Z')
  })
  it('refuse une saisie invalide', () => {
    for (const v of ['', '2026-02-30T10:00', '2026-10-14 18:00', '2026-10-14T24:00', 'demain']) expect(parseSchoolDateTime(v)).toBeNull()
  })
  it('redonne la valeur du champ datetime-local', () => {
    expect(toSchoolInput('2026-10-14T17:00:00.000Z')).toBe('2026-10-14T18:00')
  })
  it('affiche une échéance en français', () => {
    expect(formatDue('2026-10-14T17:00:00.000Z')).toBe('mercredi 14 octobre 2026 à 18 h 00')
  })
  it('affiche le temps restant', () => {
    expect(formatRemaining(0)).toBe('Temps écoulé')
    expect(formatRemaining(30_000)).toBe('1 min')
    expect(formatRemaining(42 * 60_000)).toBe('42 min')
    expect(formatRemaining((3 * 60 + 5) * 60_000)).toBe('3 h 05 min')
    expect(formatRemaining(((2 * 24 + 3) * 60 + 10) * 60_000)).toBe('2 jours 3 h')
    expect(formatRemaining((24 * 60 + 10) * 60_000)).toBe('1 jour 0 h')
  })
})

describe('horloge', () => {
  it('peut être décalée (tests e2e)', () => {
    const before = Date.now()
    setClockOffset(3_600_000)
    expect(now().getTime()).toBeGreaterThanOrEqual(before + 3_600_000)
    setClockOffset(0)
  })
})
