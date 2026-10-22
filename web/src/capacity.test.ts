import { describe, expect, it } from 'vitest'
import type { CapacityResponse } from './api'
import { loadOf, reconcile, withWeeklyHours } from './capacity'

const response = (weeklyHours: number): CapacityResponse => ({
  from: '2026-01-05',
  to: '2026-01-11',
  weeks: ['2026-01-05'],
  people: [{ id: 4, name: 'Dee Okafor', weeklyHours, allocated: [45] }],
})

describe('loadOf', () => {
  it('flags over-allocation, including people with no capacity at all', () => {
    expect(loadOf(45, 40)).toBe('over')
    expect(loadOf(20, 0)).toBe('over')
    expect(loadOf(40, 40)).toBe('full')
    expect(loadOf(30, 40)).toBe('under')
    expect(loadOf(0, 0)).toBe('idle')
  })
})

describe('keeping the grid honest after a save', () => {
  it('only touches the edited person', () => {
    const before = response(40)
    const after = withWeeklyHours(before, 4, 48)
    expect(after.people[0].weeklyHours).toBe(48)
    expect(after.people[0].allocated).toBe(before.people[0].allocated)
    expect(withWeeklyHours(before, 999, 48)).toBe(before)
  })

  it('re-applies a save that finished after a slow fetch started', () => {
    // Fetch starts (seq 0), save to 48h is confirmed (seq 1), then the fetch
    // arrives carrying the old 40h. The grid must still say 48h.
    const confirmed = new Map([[4, { weeklyHours: 48, seq: 1 }]])
    const { data, pending } = reconcile(response(40), confirmed, 0)
    expect(data.people[0].weeklyHours).toBe(48)
    expect(pending.has(4)).toBe(true)
  })

  it('trusts a fetch that started after the save', () => {
    const confirmed = new Map([[4, { weeklyHours: 48, seq: 1 }]])
    const { data, pending } = reconcile(response(52), confirmed, 1)
    expect(data.people[0].weeklyHours).toBe(52) // someone else changed it since
    expect(pending.size).toBe(0)
  })
})
