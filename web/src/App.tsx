import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { rangeFromSearch, toWeekRange, type WeekRange } from './range'

// Default range when the URL doesn't name one: the scaffold's original window,
// which covers the seed's most interesting weeks (year boundary, a part-week
// assignment, someone with zero weekly hours).
const DEFAULT_RANGE: WeekRange = toWeekRange('2025-12-29', '2026-01-16')

export function App() {
  const [range, setRange] = useState<WeekRange>(
    () => rangeFromSearch(window.location.search) ?? DEFAULT_RANGE,
  )

  // Keep the range in the URL so a reload or a shared link shows the same weeks.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('from', range.from)
    params.set('to', range.to)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [range])

  return (
    <main>
      <h1>Team capacity</h1>
      <p className="range">Allocated hours against weekly capacity, per person, per week</p>
      <CapacityGrid range={range} onRangeChange={setRange} />
    </main>
  )
}
