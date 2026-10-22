// Date helpers for ISO calendar dates ("YYYY-MM-DD").
//
// Everything is done in UTC. `new Date('2025-12-29')` is UTC midnight, and
// mixing that with local-time getters shifts dates by a day for anyone west of
// Greenwich. Keeping one time zone end to end avoids that whole class of bug.

export type IsoDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function toDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

/** Monday of the ISO week containing `iso`. */
export function mondayOf(iso: IsoDate): IsoDate {
  const d = toDate(iso)
  const offset = (d.getUTCDay() + 6) % 7 // Monday=0 … Sunday=6
  return addDays(iso, -offset)
}

/** Sunday of the ISO week containing `iso`. */
export function sundayOf(iso: IsoDate): IsoDate {
  return addDays(mondayOf(iso), 6)
}

/** Whole weeks between two Mondays, inclusive of both. */
export function weeksBetween(fromMonday: IsoDate, toMonday: IsoDate): number {
  const ms = toDate(toMonday).getTime() - toDate(fromMonday).getTime()
  return Math.round(ms / (7 * 24 * 3600 * 1000)) + 1
}

/**
 * ISO-8601 week number. Week 1 is the week with the year's first Thursday,
 * so 2025-12-29 is week 1 of 2026 — not week 53 of 2025.
 */
export function isoWeekNumber(iso: IsoDate): number {
  const thursday = addDays(mondayOf(iso), 3)
  const yearStart = toDate(`${thursday.slice(0, 4)}-01-01`)
  const diffDays = (toDate(thursday).getTime() - yearStart.getTime()) / 86_400_000
  return Math.floor(diffDays / 7) + 1
}

const dayMonth = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** "29 Dec" in the user's locale, without time-zone drift. */
export function formatDayMonth(iso: IsoDate): string {
  return dayMonth.format(toDate(iso))
}

/** Today's date in the user's own calendar, as an ISO date. */
export function today(now: Date = new Date()): IsoDate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
