import { describe, expect, it } from 'vitest'
import { addDays, isIsoDate, isoWeekNumber, mondayOf, sundayOf } from './dates'
import { MAX_WEEKS, rangeFromSearch, weekCount, withEnd, withStart } from './range'

describe('week maths', () => {
  it('snaps any day to its Monday–Sunday week', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29') // Thursday → Monday across the year boundary
    expect(mondayOf('2026-01-04')).toBe('2025-12-29') // Sunday stays in the same week
    expect(mondayOf('2026-01-05')).toBe('2026-01-05') // a Monday is its own week start
    expect(sundayOf('2025-12-29')).toBe('2026-01-04')
  })

  it('numbers weeks the ISO way at the year boundary', () => {
    expect(isoWeekNumber('2025-12-29')).toBe(1) // week 1 of 2026, not 53 of 2025
    expect(isoWeekNumber('2026-12-28')).toBe(53) // 2026 has 53 ISO weeks
    expect(isoWeekNumber('2027-01-04')).toBe(1)
  })

  it('crosses month and leap-day boundaries without drifting', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30') // EU DST change day
  })

  it('rejects dates that do not exist', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-1-5')).toBe(false)
    expect(isIsoDate('2026-01-05')).toBe(true)
  })
})

describe('range picking', () => {
  const range = { from: '2026-01-05', to: '2026-01-25' } // 3 weeks

  it('moves the end when a new start would pass it', () => {
    expect(withStart(range, '2026-02-04')).toEqual({ from: '2026-02-02', to: '2026-02-08' })
  })

  it('keeps the range within the API limit', () => {
    const wide = withEnd(range, '2027-06-30')
    expect(weekCount(wide)).toBe(MAX_WEEKS)
    expect(wide.to).toBe('2027-07-04')
  })

  it('ignores a malformed or oversized URL range safely', () => {
    expect(rangeFromSearch('?from=nope&to=2026-01-01')).toBeNull()
    const fromUrl = rangeFromSearch('?from=2025-01-01&to=2027-01-01')
    expect(fromUrl && weekCount(fromUrl)).toBe(MAX_WEEKS)
  })
})
