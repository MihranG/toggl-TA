import type { CapacityResponse } from './api'

export type Load = 'over' | 'full' | 'under' | 'idle'

// Hours come back rounded to 2 decimals; compare with a little slack so
// 40.00 of 40 is "full", not "over".
const EPSILON = 0.005

/** How loaded a person is in one week. */
export function loadOf(allocated: number, capacity: number): Load {
  if (allocated > capacity + EPSILON) return 'over'
  if (allocated <= EPSILON) return 'idle'
  if (allocated >= capacity - EPSILON) return 'full'
  return 'under'
}

/** "37.5" rather than "37.50"; whole numbers stay whole. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Returns a copy of `data` with one person's weekly hours replaced. Allocation
 * does not depend on weekly hours, so nothing else in the range changes.
 */
export function withWeeklyHours(
  data: CapacityResponse,
  personId: number,
  weeklyHours: number,
): CapacityResponse {
  let changed = false
  const people = data.people.map((p) => {
    if (p.id !== personId || p.weeklyHours === weeklyHours) return p
    changed = true
    return { ...p, weeklyHours }
  })
  return changed ? { ...data, people } : data
}

/**
 * A save the server has confirmed. `seq` orders it against range fetches so a
 * fetch that started before the save cannot overwrite the saved value when it
 * arrives late.
 */
export type ConfirmedSave = { weeklyHours: number; seq: number }

/**
 * Applies confirmed saves newer than the fetch to a freshly fetched response,
 * and returns the saves still worth remembering (those the fetch may not have
 * seen). Saves at or before `fetchStartedAt` are already in the response.
 */
export function reconcile(
  fetched: CapacityResponse,
  confirmed: ReadonlyMap<number, ConfirmedSave>,
  fetchStartedAt: number,
): { data: CapacityResponse; pending: Map<number, ConfirmedSave> } {
  let data = fetched
  const pending = new Map<number, ConfirmedSave>()
  for (const [id, save] of confirmed) {
    if (save.seq > fetchStartedAt) {
      data = withWeeklyHours(data, id, save.weeklyHours)
      pending.set(id, save)
    }
  }
  return { data, pending }
}
