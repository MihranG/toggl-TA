package main

import (
	"fmt"
	"net/http"
	"time"
)

const (
	dateLayout = "2006-01-02"
	// maxWeeks bounds one request. Payload grows as people × weeks, and with a
	// few thousand people a longer range should be paged, not sent at once.
	maxWeeks = 26
)

// capacityResponse is the contract with web/src/api.ts.
//
// weeks lists the Monday of every week in the (snapped) range. Each person's
// allocated slice is aligned with weeks by index. Capacity is the same every
// week — people.weekly_hours has no history — so it is sent once per person.
type capacityResponse struct {
	From   string           `json:"from"`
	To     string           `json:"to"`
	Weeks  []string         `json:"weeks"`
	People []capacityPerson `json:"people"`
}

type capacityPerson struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	WeeklyHours float64   `json:"weeklyHours"`
	Allocated   []float64 `json:"allocated"`
}

// Allocated hours per person per ISO week, inside [$1, $2].
//
//   - Only overlapping assignments are read (uses the start_date/end_date index).
//   - Each assignment is expanded to its days within the range and weekends are
//     dropped: assignments in the data run Monday→Sunday, and counting all seven
//     days would put every full-time person at 56h of 40h.
//   - Rows are summed, never de-duplicated: the seed splits one allocation into
//     several identical-looking rows whose hours_per_day add up to the real figure.
//   - Public holidays are not modelled (there is no calendar table).
const allocationQuery = `
SELECT a.person_id,
       date_trunc('week', d)::date        AS week_start,
       round(sum(a.hours_per_day), 2)::float8 AS hours
FROM assignments a
CROSS JOIN LATERAL generate_series(
    greatest(a.start_date, $1::date),
    least(a.end_date, $2::date),
    interval '1 day'
) AS d
WHERE a.start_date <= $2::date
  AND a.end_date   >= $1::date
  AND extract(isodow FROM d) < 6
GROUP BY a.person_id, week_start
`

const peopleQuery = `SELECT id, name, weekly_hours::float8 FROM people ORDER BY id`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The range is widened to whole weeks (Monday to Sunday) so every column the
// grid shows is a complete week.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	weeks := weekStarts(from, to)
	index := make(map[string]int, len(weeks))
	for i, wk := range weeks {
		index[wk] = i
	}

	ctx := r.Context()

	rows, err := s.db.Query(ctx, peopleQuery)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load people")
		return
	}
	var people []capacityPerson
	byID := map[int]int{}
	for rows.Next() {
		p := capacityPerson{Allocated: make([]float64, len(weeks))}
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "could not read people")
			return
		}
		byID[p.ID] = len(people)
		people = append(people, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not read people")
		return
	}

	rows, err = s.db.Query(ctx, allocationQuery, from.Format(dateLayout), to.Format(dateLayout))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load allocations")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var (
			personID int
			week     time.Time
			hours    float64
		)
		if err := rows.Scan(&personID, &week, &hours); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read allocations")
			return
		}
		pi, okP := byID[personID]
		wi, okW := index[week.Format(dateLayout)]
		if okP && okW {
			people[pi].Allocated[wi] = hours
		}
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not read allocations")
		return
	}

	if people == nil {
		people = []capacityPerson{}
	}
	writeJSON(w, http.StatusOK, capacityResponse{
		From:   from.Format(dateLayout),
		To:     to.Format(dateLayout),
		Weeks:  weeks,
		People: people,
	})
}

// parseRange validates from/to and snaps them to Monday..Sunday.
func parseRange(fromS, toS string) (time.Time, time.Time, error) {
	if fromS == "" || toS == "" {
		return time.Time{}, time.Time{}, fmt.Errorf("from and to are required (YYYY-MM-DD)")
	}
	from, err := time.Parse(dateLayout, fromS)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("from must be a date (YYYY-MM-DD)")
	}
	to, err := time.Parse(dateLayout, toS)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("to must be a date (YYYY-MM-DD)")
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("to must not be before from")
	}
	from = mondayOf(from)
	to = mondayOf(to).AddDate(0, 0, 6)
	if weeks := int(to.Sub(from).Hours()/24+1) / 7; weeks > maxWeeks {
		return time.Time{}, time.Time{}, fmt.Errorf("range is %d weeks; at most %d weeks per request", weeks, maxWeeks)
	}
	return from, to, nil
}

// mondayOf returns the Monday starting d's ISO week. Dates are parsed as UTC
// midnight, so there is no time-zone drift.
func mondayOf(d time.Time) time.Time {
	offset := (int(d.Weekday()) + 6) % 7 // Monday=0 … Sunday=6
	return d.AddDate(0, 0, -offset)
}

func weekStarts(from, to time.Time) []string {
	var weeks []string
	for d := from; !d.After(to); d = d.AddDate(0, 0, 7) {
		weeks = append(weeks, d.Format(dateLayout))
	}
	return weeks
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
