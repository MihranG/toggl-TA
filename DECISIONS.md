# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- Weekends are being count or not (assignments run Mon–Sun). I decided to not include weekends in the count. Otherwise  person with 8h/day looks like 56h against 40h, so almost everyone is “over”.
- The JSON shape: weeks[] and aligned arrays, capacity sent once per person. One-week list, plus for each person an allocated list in the same order. Two reasons: it is compact and the capacity is sent once per person, db stores one weekly_hours value per person with no history.
- Refetch vs patch after a save: I patch the row because allocation doesn’t depend on weekly hours.
  Changing weekly hours leads to  capacity change only, never allocation. So after a save the grid updates that one row from the server’s response, with no reload of the whole range.
## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- #### Hours looked about 15× too small, or like duplicates. Fixed.
    `hours_per_day` is never above 1.0 per row, and there are many identical rows. Ana’s 8h days, for example, are 15 rows: 14 × 0.5 and 1 × 1.0. It looks like duplicate data, but the rows add up to the real figure.
    It could be checked by `select * from assignments where person_id = 1 order by start_date limit 20;`.
- #### Nearly everyone was over capacity when counting every day. --Fixed.
  Assignments run Monday to Sunday, so a 7-day count shows 56h/40h. That’s the weekday decision from the first section.
- #### Editing weekly hours changes past weeks too. --Left.
    If user changes Dee's capacity to 48h, it changes the capacity of all weeks because the schema stores no history.
- #### A UI issue I saw while testing: a failed save widened the column and shifted the whole table. --Fixed.
   Fixed by fixed width for the column.

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- In one case mentioned above (missing specs parts ), whole weeks are treated as Mon-Sun, while Weekdays only is used in another place. would read that as a contradiction. That’s a genuine flaw in what the AI produced.

## What would you do differently with a week?

- #### Capacity with history
    - Problem: `people.weekly_hours` is a single value, so changing it rewrites past weeks.
    - With a week: add a table like `capacity_periods(person_id, weekly_hours, effective_from)`. The query would pick the value in effect for each week, the PATCH would take an “effective from” date (default: next Monday), and the API would return capacity per week instead of once per person.
    - Why first: it’s the biggest correctness gap IMHO.
- #### Working days and holidays
  - Problem: Mon–Fri is hard-coded and holidays are ignored.
  - With a week: a per-person working-days pattern plus a holiday calendar (per country or team). Capacity for a week becomes weekly hours × the share of working days that week; allocation counts only the person’s working days.
- #### Safe concurrent edits
    - Problem: concurrent edits can overwrite each other.
    - With a week: a version number or timestamp on each person, sent with the PATCH. If confilcts - it returns 409 , then UI shows that it is changed by someone else.
- #### Scale to a few thousand people
    - Problem: everyone is fetched and rendered at once. That's fine for the couple of hours people, but will be heavy for e.g. 4000 ppl X 26 weeks.
    - With a week: 
      - table virtualization in UI: render only the visible range,
      - server side pagination and name search
      - over allocated only filter (not in the UI)
      - API that returns only the visible range,
      - API that returns only the people in the visible range.