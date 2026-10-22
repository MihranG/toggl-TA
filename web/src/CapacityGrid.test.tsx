import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CapacityResponse } from './api'
import { CapacityGrid } from './CapacityGrid'

const capacity: CapacityResponse = {
  from: '2026-01-05',
  to: '2026-01-11',
  weeks: ['2026-01-05'],
  people: [{ id: 4, name: 'Dee Okafor', weeklyHours: 40, allocated: [45] }],
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function deeRow() {
  return screen.getByRole('row', { name: /Dee Okafor/ })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('editing weekly hours', () => {
  it('rolls back and explains a failed save, and Retry recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, capacity)) // initial load
      .mockResolvedValueOnce(json(500, { error: 'could not save weekly hours' }))
      .mockResolvedValueOnce(json(200, { id: 4, name: 'Dee Okafor', weeklyHours: 48 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<CapacityGrid range={{ from: '2026-01-05', to: '2026-01-11' }} onRangeChange={() => {}} />)
    await screen.findByRole('row', { name: /Dee Okafor/ })
    expect(within(deeRow()).getByTitle(/45h allocated of 40h/)).toBeTruthy()

    fireEvent.click(within(deeRow()).getByRole('button', { name: /40 hours per week/ }))
    const input = screen.getByLabelText('Weekly hours for Dee Okafor')
    fireEvent.change(input, { target: { value: '48' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    // Failed: the stored 40h is back, the cell is judged against it again,
    // and the manager is told what didn't save.
    const alert = await within(deeRow()).findByRole('alert')
    expect(alert.textContent).toContain('Couldn’t save 48h')
    expect(within(deeRow()).getByRole('button', { name: /40 hours per week/ })).toBeTruthy()
    expect(within(deeRow()).getByTitle(/45h allocated of 40h/).className).toContain('over')

    // Retry sends the same value and, on success, the row reflects it with no refetch.
    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    })
    await waitFor(() => expect(within(deeRow()).queryByRole('alert')).toBeNull())
    expect(within(deeRow()).getByTitle(/45h allocated of 48h/).className).toContain('under')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [url, init] = fetchMock.mock.calls[2]
    expect(url).toBe('/api/people/4')
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ weeklyHours: 48 }) })
  })
})
