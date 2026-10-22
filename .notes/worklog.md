# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Data findings (checked in psql before writing the query)

- `hours_per_day` max is 1.0 per row, but one allocation is split across ~15 identical-looking rows (e.g. Ana: 14 × 0.5 + 1 × 1.0 = 8h/day). Rows must be **summed**; de-duplicating them would silently cut allocation by ~15×.
- Assignments run Monday → Sunday. Counting all seven days puts a full-time person at 56h/40h, so only weekdays (isodow 1–5) count.
- Eli Nakamura has `weekly_hours = 0` but 20h allocated in the week of Jan 5 — any "%" must not divide by zero; treated as over-allocated.
- Dee Okafor has a Wed–Fri assignment (Jan 7–9) at 5h/day → 45h/40h that week. Good check that partial weeks are counted by day, not by "assignment touches week".
- 2025-12-29 is ISO week 1 of 2026; week numbers come from the Monday's Thursday, not `extract(year)` + `extract(week)`.

## Decisions

- **Response shape:** `weeks[]` (Mondays) + per person `{id, name, weeklyHours, allocated[]}` aligned by index. Capacity is sent once per person because `weekly_hours` has no history — it is the same for every week.
- **Range:** server snaps `from`/`to` to whole Mon–Sun weeks and echoes the snapped range, so the client never renders a partial column. Capped at 26 weeks per request; with a few thousand people a longer range should be paged, not sent whole.
- **Query:** reads only assignments overlapping the range (start/end index), expands each to its days inside the range, groups by person + week. People are a separate query so everyone appears even with no allocation. ~0.3s for a quarter × 500 people locally.
- **After a save:** PATCH returns the stored person; the grid patches that one row. No refetch — weekly hours change capacity, never allocation, so nothing else on screen can be stale.
- **While saving:** the row shows the new value (dashed cells, "Saving…") so the manager sees the effect immediately. On failure it falls back to the stored value and keeps the error visible with Retry / Dismiss — it doesn't silently revert.
- **Late data:** a range fetch that started before a save finished would carry the old value. Saves are sequence-numbered and re-applied over any fetch that started earlier (`reconcile` in `capacity.ts`). Changing range aborts the previous request.
- **Loading:** first load shows a skeleton; later range changes keep the old grid on screen, dimmed, with "Loading…", rather than collapsing.
- **Sorting** by name with `Intl.Collator` on the client. People are ordered by id in SQL because the Alpine Postgres collation may not sort names like "Álvarez" / "Þórsdóttir" the way a person expects.
- **Range in the URL** so reload / a shared link shows the same weeks.

## Verification

- Ran the API against the seeded DB and checked: Dee 45/40 (Jan 5 wk), Eli 20/0, Ana 40/40 (Dec 29 wk) — 41 of 500 people over in the default range.
- Drove the UI in a headless browser: slow save ("Saving…" visible), 500 → rollback + message, network failure message, Retry, Escape, validation (>80), next week, reload keeps range.
- Vitest: week maths at the year boundary, range clamping, late-fetch reconcile, and one component test for failed save → rollback → Retry. Broke the rollback on purpose to confirm the component test fails.

## Caught during review of AI-written code

- First version of the hours editor saved on blur unconditionally: pressing Escape unmounts the input, and a blur fired with the stale draft could save the value just cancelled. Added a `closed` guard.
- The failed-save message widened the "Weekly hours" column and reflowed the whole table; fixed with a fixed column width.

## Left unfinished / deferred

- Public holidays aren't modelled (no calendar data) — the Dec 29 week includes Jan 1 and is counted as 5 working days.
- `weekly_hours` has no effective date, so an edit rewrites capacity for past weeks too. A real fix needs a dated capacity table.
- No virtualization: 500 rows × 26 weeks renders fine; a few thousand people would need row virtualization and server-side paging/filtering.
- No concurrency control on PATCH (last write wins). Would add a version / If-Match with more time.
- Local dev env note: couldn't pull Postgres 17 / Go 1.26 in the sandbox used for development; verified against Postgres 16 and Go 1.24 with pgx 5.7. Needs a final check under `make up`.

## Editor setup

- WebStorm flagged "cannot find module" errors everywhere: compose mounts an anonymous volume over `web/node_modules`, so `npm install` inside the container never reaches the host and the IDE sees an empty folder. Ran `npm install` in `web/` on the host for editor tooling only; compose left untouched (run environment is fixed). `tsc --noEmit` was clean throughout.
