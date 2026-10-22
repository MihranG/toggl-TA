import { addDays, isIsoDate, mondayOf, sundayOf, weeksBetween, type IsoDate } from './dates'

/** A whole-week range: `from` is a Monday, `to` is a Sunday. */
export type WeekRange = { from: IsoDate; to: IsoDate }

/** Must match maxWeeks in api/capacity.go. */
export const MAX_WEEKS = 26

export function weekCount(range: WeekRange): number {
  return weeksBetween(range.from, mondayOf(range.to))
}

/** Snaps any two dates to whole weeks, keeping them in order. */
export function toWeekRange(from: IsoDate, to: IsoDate): WeekRange {
  const [a, b] = from <= to ? [from, to] : [to, from]
  return { from: mondayOf(a), to: sundayOf(b) }
}

/** Moves the whole range by `weeks` (negative = earlier), keeping its length. */
export function shiftRange(range: WeekRange, weeks: number): WeekRange {
  return { from: addDays(range.from, weeks * 7), to: addDays(range.to, weeks * 7) }
}

/**
 * The manager picked a new start. Keep the end where it was unless that would
 * put it before the start or past MAX_WEEKS; then move the end.
 */
export function withStart(range: WeekRange, from: IsoDate): WeekRange {
  const start = mondayOf(from)
  let end = range.to < start ? sundayOf(start) : range.to
  if (weeksBetween(start, mondayOf(end)) > MAX_WEEKS) end = addDays(start, MAX_WEEKS * 7 - 1)
  return { from: start, to: end }
}

/** The mirror of withStart for the end date. */
export function withEnd(range: WeekRange, to: IsoDate): WeekRange {
  const end = sundayOf(to)
  let start = range.from > end ? mondayOf(end) : range.from
  if (weeksBetween(start, mondayOf(end)) > MAX_WEEKS) start = addDays(mondayOf(end), -(MAX_WEEKS - 1) * 7)
  return { from: start, to: end }
}

/** Reads ?from=&to= from a query string, or returns null if absent/invalid. */
export function rangeFromSearch(search: string): WeekRange | null {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  const to = params.get('to')
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) return null
  const range = toWeekRange(from, to)
  return weekCount(range) > MAX_WEEKS ? withStart(range, range.from) : range
}

/** Moves the range so it starts on the week of `date`, keeping its length. */
export function startingAt(range: WeekRange, date: IsoDate): WeekRange {
  const from = mondayOf(date)
  return { from, to: addDays(from, weekCount(range) * 7 - 1) }
}
