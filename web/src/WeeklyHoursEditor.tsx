import { useRef, useState } from 'react'
import { formatHours } from './capacity'
import type { Edit } from './useCapacity'

const MIN = 0
const MAX = 80 // matches maxWeeklyHours in api/people.go

type Props = {
  personName: string
  /** The saved value. */
  weeklyHours: number
  edit: Edit | undefined
  onSave: (weeklyHours: number) => void
  onDismiss: () => void
}

/** Parses the input, or returns an error message for the manager. */
export function parseWeeklyHours(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return { error: 'Enter a number of hours.' }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { error: 'Enter a number of hours.' }
  if (value < MIN || value > MAX) return { error: `Use ${MIN}–${MAX} hours.` }
  return { value: Math.round(value * 100) / 100 }
}

/**
 * The capacity cell. Click to edit; Enter or leaving the field saves, Escape
 * cancels. While saving the new value is shown (and used by the row) with a
 * "saving" marker. If the save fails the row goes back to the saved value and
 * the failure stays visible with Retry and Dismiss until the manager acts.
 */
export function WeeklyHoursEditor({ personName, weeklyHours, edit, onSave, onDismiss }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  // Set when Enter/Escape already closed the editor, so the blur that follows
  // the input's removal can't save a value the manager just cancelled.
  const closed = useRef(false)

  const startEditing = () => {
    closed.current = false
    setInvalid(null)
    setDraft(formatHours(edit?.status === 'failed' ? edit.weeklyHours : weeklyHours))
  }

  const cancel = () => {
    closed.current = true
    setDraft(null)
    setInvalid(null)
  }

  const commit = () => {
    if (draft === null || closed.current) return
    const parsed = parseWeeklyHours(draft)
    if ('error' in parsed) {
      setInvalid(parsed.error)
      return
    }
    closed.current = true
    setDraft(null)
    setInvalid(null)
    if (parsed.value === weeklyHours) {
      // Back to the saved value: nothing to send, and any failed attempt is moot.
      if (edit?.status === 'failed') onDismiss()
      return
    }
    onSave(parsed.value)
  }

  if (draft !== null) {
    return (
      <div className="hours-editor">
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-label={`Weekly hours for ${personName}`}
          aria-invalid={invalid !== null}
          onChange={(e) => {
            setDraft(e.target.value)
            setInvalid(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          onBlur={() => (invalid === null ? commit() : undefined)}
        />
        <span className="unit">h</span>
        {invalid && (
          <span className="field-error" role="alert">
            {invalid}
          </span>
        )}
      </div>
    )
  }

  if (edit?.status === 'saving') {
    return (
      <div className="hours-value saving" aria-live="polite">
        {formatHours(edit.weeklyHours)}h <span className="status">Saving…</span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        className="hours-value"
        onClick={startEditing}
        title="Edit weekly hours"
        aria-label={`${personName}: ${formatHours(weeklyHours)} hours per week. Edit`}
      >
        {formatHours(weeklyHours)}h
      </button>
      {edit?.status === 'failed' && (
        <div className="save-error" role="alert">
          <span>
            Couldn’t save {formatHours(edit.weeklyHours)}h: {edit.message}
          </span>
          <button type="button" onClick={() => onSave(edit.weeklyHours)}>
            Retry
          </button>
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
