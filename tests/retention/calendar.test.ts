import { describe, it, expect } from 'vitest'
import { resetYearFor, isWarningPeriod } from '@/lib/retention/calendar'

const ms = (iso: string) => Date.parse(iso)

describe('resetYearFor', () => {
  it.each([
    ['2026-11-19T10:00:00Z', 2026],
    ['2027-07-30T12:00:00Z', 2026],
    ['2027-07-31T05:00:00Z', 2027],
    ['2027-07-30T23:30:00Z', 2027], // 00:30 le 31 à Rabat (GMT+1)
    ['2027-01-01T00:30:00Z', 2026],
  ])('%s -> %i', (iso, year) => {
    expect(resetYearFor(ms(iso))).toBe(year)
  })
})

describe('isWarningPeriod', () => {
  it.each([
    ['2027-06-14T23:30:00Z', true], // 15 juin 00:30 à Rabat (GMT+1)
    ['2027-06-14T22:30:00Z', false], // 14 juin 23:30 à Rabat
    ['2027-06-14T12:00:00Z', false],
    ['2027-07-30T12:00:00Z', true],
    ['2027-07-31T05:00:00Z', false],
    ['2027-03-01T12:00:00Z', false],
  ])('%s -> %s', (iso, expected) => {
    expect(isWarningPeriod(ms(iso))).toBe(expected)
  })
})
