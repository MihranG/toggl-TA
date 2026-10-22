import { useMemo, useState } from 'react'
import type { CapacityPerson } from './api'
import { formatHours, loadOf } from './capacity'
import { formatDayMonth, isoWeekNumber, mondayOf, today } from './dates'
import { MAX_WEEKS, shiftRange, startingAt, weekCount, withEnd, withStart, type WeekRange } from './range'
import { useCapacity, type Edit } from './useCapacity'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'

type Props = {
  range: WeekRange
  onRangeChange: (range: WeekRange) => void
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** The capacity a row should be judged against right now. */
function effectiveCapacity(person: CapacityPerson, edit: Edit | undefined): number {
  // While a save is in flight the row reflects the new value, so the manager
  // sees the effect immediately. A failed save falls back to what is stored.
  return edit?.status === 'saving' ? edit.weeklyHours : person.weeklyHours
}

/**
 * One row per person, one column per week. Each cell is allocated hours for
 * that week, judged against the person's weekly hours.
 */
export function CapacityGrid({ range, onRangeChange }: Props) {
  const { data, fetchState, edits, reload, save, dismissEdit } = useCapacity(range.from, range.to)
  const [query, setQuery] = useState('')
  const [onlyOver, setOnlyOver] = useState(false)

  const rows = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLocaleLowerCase()
    return data.people
      .map((person) => {
        const capacity = effectiveCapacity(person, edits.get(person.id))
        const overWeeks = person.allocated.filter((a) => loadOf(a, capacity) === 'over').length
        return { person, capacity, overWeeks }
      })
      .filter((r) => !needle || r.person.name.toLocaleLowerCase().includes(needle))
      .filter((r) => !onlyOver || r.overWeeks > 0 || edits.has(r.person.id))
      .sort((a, b) => collator.compare(a.person.name, b.person.name))
  }, [data, edits, query, onlyOver])

  const overPeople = useMemo(() => {
    if (!data) return 0
    return data.people.filter((p) => {
      const capacity = effectiveCapacity(p, edits.get(p.id))
      return p.allocated.some((a) => loadOf(a, capacity) === 'over')
    }).length
  }, [data, edits])

  const loading = fetchState.status === 'loading'
  // The rendered weeks may lag the requested range while it loads; say so.
  const stale = data !== null && (loading || data.from !== range.from || data.to !== range.to)

  return (
    <section className="capacity" aria-busy={loading}>
      <RangeControls range={range} onRangeChange={onRangeChange} />

      {fetchState.status === 'error' && (
        <div className="banner error" role="alert">
          <span>
            Couldn’t load {formatDayMonth(range.from)} – {formatDayMonth(range.to)}: {fetchState.message}
            {data && ' Showing the last range that loaded.'}
          </span>
          <button type="button" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {data === null ? (
        fetchState.status === 'loading' && <GridSkeleton weeks={weekCount(range)} />
      ) : (
        <>
          <div className="grid-toolbar">
            <input
              type="search"
              placeholder="Filter by name"
              aria-label="Filter people by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="checkbox">
              <input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} />
              Only over-allocated
            </label>
            <span className="summary">
              <strong className={overPeople > 0 ? 'over-text' : undefined}>{overPeople}</strong> of{' '}
              {data.people.length} people over capacity in this range
            </span>
            {loading && <span className="loading-note">Loading…</span>}
          </div>

          <div className={`grid-scroll${stale ? ' stale' : ''}`}>
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col" className="name-col">
                    Person
                  </th>
                  <th scope="col" className="hours-col">
                    Weekly hours
                  </th>
                  {data.weeks.map((week) => (
                    <th scope="col" key={week} className={week === mondayOf(today()) ? 'this-week' : undefined}>
                      <span className="week-num">W{isoWeekNumber(week)}</span>
                      <span className="week-date">{formatDayMonth(week)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={data.weeks.length + 2} className="empty">
                      {onlyOver ? 'Nobody is over capacity in this range.' : 'No one matches that filter.'}
                    </td>
                  </tr>
                )}
                {rows.map(({ person, capacity }) => {
                  const edit = edits.get(person.id)
                  return (
                    <tr key={person.id} className={edit?.status === 'saving' ? 'pending' : undefined}>
                      <th scope="row" className="name-col">
                        {person.name}
                      </th>
                      <td className="hours-col">
                        <WeeklyHoursEditor
                          personName={person.name}
                          weeklyHours={person.weeklyHours}
                          edit={edit}
                          onSave={(hours) => save(person.id, hours)}
                          onDismiss={() => dismissEdit(person.id)}
                        />
                      </td>
                      {person.allocated.map((allocated, i) => (
                        <Cell key={data.weeks[i]} allocated={allocated} capacity={capacity} />
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
    </section>
  )
}

function Cell({ allocated, capacity }: { allocated: number; capacity: number }) {
  const load = loadOf(allocated, capacity)
  const over = allocated - capacity
  const pct = capacity > 0 ? Math.round((allocated / capacity) * 100) : null
  const label =
    load === 'idle'
      ? 'Nothing allocated'
      : `${formatHours(allocated)}h allocated of ${formatHours(capacity)}h` +
        (pct !== null ? ` (${pct}%)` : ' (no capacity)')

  return (
    <td className={`cell ${load}`} title={label}>
      {load === 'idle' ? (
        <span aria-label={label}>–</span>
      ) : (
        <>
          <span className="allocated">{formatHours(allocated)}</span>
          {load === 'over' && <span className="overage">+{formatHours(over)}</span>}
        </>
      )}
    </td>
  )
}

function RangeControls({ range, onRangeChange }: Props) {
  const weeks = weekCount(range)
  const thisMonday = mondayOf(today())
  return (
    <div className="range-controls">
      <div className="nav" role="group" aria-label="Move by week">
        <button type="button" onClick={() => onRangeChange(shiftRange(range, -1))} aria-label="Previous week">
          ←
        </button>
        <button
          type="button"
          onClick={() => onRangeChange(startingAt(range, thisMonday))}
          disabled={range.from === thisMonday}
        >
          This week
        </button>
        <button type="button" onClick={() => onRangeChange(shiftRange(range, 1))} aria-label="Next week">
          →
        </button>
      </div>
      <label>
        From
        <input
          type="date"
          value={range.from}
          onChange={(e) => e.target.value && onRangeChange(withStart(range, e.target.value))}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={range.to}
          onChange={(e) => e.target.value && onRangeChange(withEnd(range, e.target.value))}
        />
      </label>
      <span className="range-note">
        {weeks} {weeks === 1 ? 'week' : 'weeks'} · whole weeks, Mon–Sun · up to {MAX_WEEKS}
      </span>
    </div>
  )
}

function GridSkeleton({ weeks }: { weeks: number }) {
  return (
    <div className="skeleton" aria-label="Loading capacity">
      {Array.from({ length: 8 }, (_, r) => (
        <div className="skeleton-row" key={r}>
          <span className="skeleton-name" />
          {Array.from({ length: Math.min(weeks, 12) + 1 }, (_, c) => (
            <span className="skeleton-cell" key={c} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <p className="legend">
      <span className="swatch over" /> Over capacity (+hours over)
      <span className="swatch full" /> Fully allocated
      <span className="swatch under" /> Has room
      <span className="swatch idle" /> Nothing allocated
      <span className="legend-note">Weekdays only. Public holidays are not taken into account.</span>
    </p>
  )
}
