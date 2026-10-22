import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchCapacity, updateWeeklyHours, type CapacityResponse } from './api'
import { reconcile, withWeeklyHours, type ConfirmedSave } from './capacity'
import type { IsoDate } from './dates'

export type Edit =
  | { status: 'saving'; weeklyHours: number }
  | { status: 'failed'; weeklyHours: number; message: string }

type Fetch =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong.'
}

/**
 * Loads the capacity grid for a range and owns edits to weekly hours.
 *
 * - Changing the range aborts the previous request, so a slow response for an
 *   old range can never replace the current one.
 * - While a new range loads, the previous data stays on screen (marked stale)
 *   instead of collapsing to a spinner.
 * - A successful save patches the one affected row from the server's response.
 *   No refetch: weekly hours change capacity, never allocation.
 * - A save that finishes while a fetch is in flight is re-applied when that
 *   fetch lands (see `reconcile`), so late data can't undo a save.
 */
export function useCapacity(from: IsoDate, to: IsoDate) {
  const [data, setData] = useState<CapacityResponse | null>(null)
  const [fetchState, setFetchState] = useState<Fetch>({ status: 'loading' })
  const [edits, setEdits] = useState<ReadonlyMap<number, Edit>>(new Map())
  const [reloadKey, setReloadKey] = useState(0)

  const saveSeq = useRef(0)
  const confirmed = useRef(new Map<number, ConfirmedSave>())

  useEffect(() => {
    const controller = new AbortController()
    const startedAt = saveSeq.current
    setFetchState({ status: 'loading' })

    fetchCapacity(from, to, controller.signal).then(
      (fetched) => {
        const { data: next, pending } = reconcile(fetched, confirmed.current, startedAt)
        confirmed.current = pending
        setData(next)
        setFetchState({ status: 'ready' })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setFetchState({ status: 'error', message: messageOf(err) })
      },
    )

    return () => controller.abort()
  }, [from, to, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const save = useCallback(async (personId: number, weeklyHours: number) => {
    setEdits((prev) => new Map(prev).set(personId, { status: 'saving', weeklyHours }))
    try {
      const person = await updateWeeklyHours(personId, weeklyHours)
      const seq = ++saveSeq.current
      confirmed.current.set(person.id, { weeklyHours: person.weeklyHours, seq })
      setData((prev) => (prev ? withWeeklyHours(prev, person.id, person.weeklyHours) : prev))
      setEdits((prev) => {
        const next = new Map(prev)
        next.delete(personId)
        return next
      })
    } catch (err) {
      setEdits((prev) =>
        new Map(prev).set(personId, { status: 'failed', weeklyHours, message: messageOf(err) }),
      )
    }
  }, [])

  const dismissEdit = useCallback((personId: number) => {
    setEdits((prev) => {
      if (!prev.has(personId)) return prev
      const next = new Map(prev)
      next.delete(personId)
      return next
    })
  }, [])

  return { data, fetchState, edits, reload, save, dismissEdit }
}
