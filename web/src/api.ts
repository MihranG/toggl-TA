import type { IsoDate } from './dates'

// Mirrors capacityResponse in api/capacity.go.
export type CapacityPerson = {
  id: number
  name: string
  weeklyHours: number
  /** Allocated hours, aligned by index with CapacityResponse.weeks. */
  allocated: number[]
}

export type CapacityResponse = {
  /** Monday of the first week (the server snaps the requested range). */
  from: IsoDate
  /** Sunday of the last week. */
  to: IsoDate
  /** Monday of each week, in order. */
  weeks: IsoDate[]
  people: CapacityPerson[]
}

// Mirrors person in api/people.go.
export type Person = {
  id: number
  name: string
  weeklyHours: number
}

/** An error with a message that is safe to show to a manager. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      message = body.error
    }
  } catch {
    // Not JSON (e.g. a proxy error page). Keep the generic message.
  }
  return new ApiError(message, res.status)
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Could not reach the server. Check your connection.', 0)
  }
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

export function fetchCapacity(from: IsoDate, to: IsoDate, signal?: AbortSignal) {
  const params = new URLSearchParams({ from, to })
  return request<CapacityResponse>(`/api/capacity?${params}`, { signal })
}

export function updateWeeklyHours(id: number, weeklyHours: number) {
  return request<Person>(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
}
