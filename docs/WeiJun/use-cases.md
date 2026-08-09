# Use Cases — Member 4 (Coverage, Calendar & Scheduling Rules)

**Author:** Wei Jun · Member 4
**Owned use cases:** UC-06 · UC-07 · UC-17 · UC-18 · UC-19 · UC-29 · AI-2
**Owned routes:** `routes/coverage.js`, `routes/publicHoliday.js`
**Owned services:** `services/coverage.js` (AI-2 engine), `services/calculationService.js`,
`services/staffingService.js`, `services/weekendConfigService.js`

My vertical is the calendar and scheduling engine every other member's flows sit on
top of: what counts as a working day, whether a public holiday is in the way,
whether the team can spare someone, and whether HR has declared the dates
off-limits. None of these four questions has a UI of their own most of the time —
they answer *inside* M2's apply flow, M2's team calendar, and M3's approval screen.
That is by design: `calculationService.computeDays` is the one function every
member calls for "how many days is this", so it can never disagree with itself
between the forecast panel and the final balance deduction.

---

## Actors that touch my use cases

| Actor | Where they appear in my flows |
|---|---|
| **Employee** | Sees teammates' leave and public holidays before applying; gets a coverage warning and an alternative-date suggestion if their request would leave the team short |
| **Supervisor / Manager** | See the same team calendar with everyone under their scope, including delegated teams; decide coverage-flagged requests as a special-approval exception |
| **HR Admin** | Configures each country's weekend days (UC-29), imports public holidays (UC-06), and defines blackout periods (UC-18) |
| **System** | Computes chargeable days on every apply, forecast, and final approval (UC-19), so the number can never drift between screens |

---

## UC-06 — Public holiday calendar

**Actor:** HR Admin (import) · Employee (display) · System (exclusion from day counting)
**Goal:** Every employee's leave duration is computed against their own country's
public holidays, not a single shared calendar.

**Main flow**

1. Public holidays are seeded per country from the group's 2026 reference data —
   200 dates across the company's 10 operating countries (`seed.js` loads
   `data/holidays2026.js` directly at startup).
2. HR Admin can add further dates at any time via `POST /holiday/import`, given as
   a JSON list rather than a file upload.
3. `GET /holiday` returns the caller's own country's list (or an explicit
   `?country=` for an HR Admin checking another country), sorted by date.
4. Every place that counts leave days — apply, forecast, and final approval — asks
   `calculationService` for the holiday set as a `Set<string>` lookup and skips
   any date inside it (UC-19).

**Edge cases handled**

| Case | Behaviour |
|---|---|
| A leave range crosses a public holiday | That date is not charged; the forecast panel names it explicitly so the employee sees why the day count is lower than the calendar range |
| An unrecognised country code is queried | Returns an empty list rather than erroring — no holidays configured, not a bug |
| The same date imported twice | No de-duplication check on import; a duplicate row would double-count in nothing (the holiday set only asks "is this date a holiday", not "how many"), but it is still an untidy data state worth a follow-up guard |

**Divergence from the original design**

The original brief called for CSV upload or an online calendar feed, and a
per-country "Thailand only observes a configurable subset" rule. Neither is
implemented: import is a JSON body (`{ country, holidays: [{date, name}] }`), and
every imported date for a country applies uniformly — there is no subset toggle.
What *is* implemented for Thailand is unrelated and belongs to M2/M5: a sick-leave
policy where Thailand grants 0 days without a medical certificate
(`services/leaveRules.js`). Worth being clear about the difference in the review —
"Thailand is handled differently" is true, but not for the reason the design
document originally described.

---

## UC-07 — Team coverage & the AI-2 Smart Coverage Analyzer

**Actor:** Employee (sees the warning) · Supervisor/Manager (decides the exception)
**Goal:** An employee finds out *before* they submit that their dates would leave
the team short, with a plain-English reason and a genuine alternative — not just a
red flag with no explanation.

**Main flow**

1. While filling in the leave form, the employee's dates are checked against
   `POST /leave/coverage-check` (a M2-owned route that calls straight into my
   `services/coverage.js` engine — the endpoint lives with the form it serves, the
   logic lives here).
2. For every working day in the range, `evaluateCoverage` counts who else on the
   same team is already approved off that day, and compares present headcount
   against the fixed threshold (`MIN_PRESENT = 3`, matching the HLD's own "3 of 5"
   example).
3. Each conflicting date gets a human-readable line — *"Only 2 of 5 present on
   2026-08-11 (also away: Priya, Marcus)"* — built from the same data, not a
   separate description.
4. If there is a conflict, `suggestAlternative` probes forward day by day for the
   nearest same-length window with zero conflicts and returns it as a suggestion.
5. The employee may take the alternative, adjust the dates themselves, or submit
   anyway — submitting anyway sets `flagged = true` on the request and routes it
   for Manager special-approval instead of the normal chain (UC-02).
6. On submission the same `evaluateCoverage` call runs again server-side as the
   authority — the pre-submission check is advisory, the value on the actual
   record is computed independently, not trusted from the client.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| The requester is the only person who would be "off" | They are excluded from their own headcount count (`offOn(..., excludeUserId)`), so a request cannot flag itself as a conflict with itself |
| No alternative window exists within 90 days of probing | `suggestAlternative` returns `null` rather than looping forever; the employee sees no suggestion, just the conflict |
| Team is small enough that `MIN_PRESENT` can never be met | Every request from that team is flagged; this is a real limitation of a fixed threshold rather than a proportional one — see "What I would improve" |
| The employee's own leave on the same team overlaps a flagged date twice (AM/PM half-days) | `offOn` matches by date range, not row-for-row, so this does not double-count |

**Divergence from the original design**

"AI-2" is a rule-based template engine over real coverage data, not a hosted LLM
call — the explanation sentence is built with a fixed string template, not
generated text. This was a deliberate choice: the number that decides whether a
request gets flagged has to be exactly reproducible on every screen that shows it
(forecast, approval card, final record), which a model call cannot guarantee.
Compare AI-1 (Jervis) and AI-4/AI-5 (Nabil), which do call a hosted model, precisely
because their outputs are advisory summaries rather than the number a balance
depends on.

**What I would improve.** `MIN_PRESENT` is a flat constant regardless of team
size. A team of 3 can never satisfy "3 present" the moment its own member takes
leave, which flags every single request from small teams as a coverage exception
regardless of actual risk. A proportional threshold (e.g. 60% of team size,
floor 2) would fix this; I did not change it because live pending-approval data
already depends on the current constant and I did not want to silently change
what "flagged" means this late in the build.

---

## UC-17 — Manpower heatmap & coverage dashboard

**Status: not built.** The design document called for a calendar heatmap showing
daily on-duty headcount, colour-coded against a minimum-staffing level, filterable
by team and country. `services/staffingService.js` explicitly documents its own
removal:

> *"The minimum-staffing rules and the manpower heatmap that used to live here
> were removed: coverage pressure is reported by services/coverage.js (AI-2), and
> restricted windows are now expressed only as blackout periods."*

What exists instead: coverage pressure surfaces at the point someone actually
tries to book leave (UC-07), rather than as a standing dashboard, and
`anomalyDetector.js` (Nabil's, M5) separately counts pending requests flagged for
coverage below threshold as one HR risk signal. Both are real signal, but neither
is the heatmap the design document specified. I am recording this as a gap rather
than describing a screen that does not exist — see
`docs/TEAM-SUBMISSION-STATUS.md` and the rubric: a missing use case artefact costs
real marks, and a false claim of one costs more if a marker asks to see it live.

---

## UC-18 — Blackout / restricted leave periods

**Actor:** HR Admin, Manager, or Boss (create/deactivate) · Employee (sees them on
the calendar, gets blocked or flagged on apply)
**Goal:** HR or a Manager can declare a window (year-end close, a product launch,
a client audit) where leave is either impossible or needs explicit sign-off,
scoped to a whole country or a single team.

**Main flow**

1. An authorised user creates a period via `POST /coverage/blackouts`, giving a
   scope (`COUNTRY` or `TEAM`), the matching `scopeId`, a date range, a mode
   (`BLOCK` or `SPECIAL_APPROVAL`), and an optional reason.
2. `scopeId` is validated against a closed list, never accepted as free text — a
   `COUNTRY` scope must name a country that has a configured leave policy, a
   `TEAM` scope must name one of the configured teams (`config/teams.js`).
   A typo would otherwise silently create a blackout that matches nobody.
3. Every employee sees active periods that apply to their own country and team on
   their calendar via `GET /coverage/blackouts` (HR/Manager can pass `?all=1` to
   see every active period, or `?country=`/`?team=` to check another scope).
4. When a leave request's date range is checked (`staffingService.blackoutForRange`),
   overlapping periods are combined: if **any** overlapping period is `BLOCK`,
   the whole range is refused and the response names the specific dates that are
   hard-blocked, even if only the edge of the range touches the window. If none
   are `BLOCK` but at least one is `SPECIAL_APPROVAL`, the request is allowed but
   flagged, the same exception path UC-07 uses.
5. HR/Manager deactivate a period with `PUT /coverage/blackouts/:id/deactivate`
   rather than deleting it, so the historical record and its audit trail survive.
6. Every create and deactivate is written to `ConfigAuditLog` with a full
   before/after snapshot.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| A range only touches the edge of a BLOCK window | Only the days actually inside the window are named as blocked, not the whole requested range |
| Both a COUNTRY BLOCK and a TEAM SPECIAL_APPROVAL period overlap the same range | BLOCK wins outright — the stronger mode always governs |
| `endDate` before `startDate` | Refused with a plain message before any database write |
| An unrecognised country or team is given | Refused, and the response lists the valid options rather than a generic validation error |
| A period is deactivated rather than deleted | Existing audit history and any request that was decided under it remain intact |

---

## UC-19 — Working-day & holiday-aware leave calculation

**Actor:** System (used by every leave-duration computation across the app)
**Goal:** One function computes "how many days is this leave", called from apply,
forecast, and final approval, so those three screens can never disagree.

**Main flow**

1. `calculationService.computeDays(startISO, endISO, halfDay, workingDays,
   holidaySet)` is the single entry point. It is a pure function — no database
   access, no request object — so it is trivially unit-testable and impossible to
   accidentally call with stale data from a previous request.
2. A half-day request is always `0.5`, regardless of range length (half-days are
   single-day only — validated at the M2 apply route, not here).
3. Otherwise, every calendar day in the range is checked against the caller's
   country weekend configuration (UC-29) and holiday set (UC-06); only days that
   are both a working weekday *and* not a public holiday are counted.
4. `services/weekendConfigService.workingDaysFor(country)` supplies the weekend
   map, falling back to the Sat/Sun default when a country has no explicit row.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Range is entirely weekend and/or holiday | Returns `0`, not a negative number or `NaN` — the M2 apply route separately refuses a request that computes to zero chargeable days |
| A country with a non-Sat/Sun weekend (e.g. Friday/Saturday) | Handled correctly because the function reads the config map rather than hard-coding which weekday indices are "the weekend" |
| A public holiday lands on what would already be a non-working day | No double-exclusion bug — a day is either working or not; a holiday on a weekend simply changes nothing |
| No weekend config supplied at all | Falls back to `DEFAULT_WORKING_DAYS` (Mon–Fri) rather than throwing |

---

## UC-29 — Country-specific weekend configuration

**Actor:** HR Admin
**Goal:** A country whose working week is not Monday–Friday (e.g. a Friday/Saturday
weekend) computes leave duration correctly, without every other member's code
needing to know about it.

**Main flow**

1. HR Admin opens the coverage configuration panel and, per country, sets which
   of the seven weekdays are working days.
2. `PUT /coverage/weekend-config` validates the payload has an explicit boolean
   for every day, then checks `hasAtLeastOneWorkingDay` — a full-week weekend is
   refused outright.
3. The previous configuration (or the Sat/Sun default, if none existed) and the
   new one are both written to `ConfigAuditLog` as a before/after pair.
4. `GET /coverage/weekend-config` lists every configured country's map, filling in
   the default for any country that has no explicit row — so the admin screen
   never shows a blank entry.
5. Every subsequent day-count for that country reads the new configuration
   (UC-19); requests already approved before the change are not recalculated.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Admin tries to set every day to non-working | Refused with a specific message, not a generic validation error |
| A country has never had a config set | Reads and displays the Sat/Sun default; the audit "before" value on first change is also the default, not `null` |
| Country code given in lowercase | Normalised to uppercase before lookup or write, so `sg` and `SG` are the same row |

---

## Where my engine is consumed by other members

Documenting this explicitly because it is easy to miss in a routes-by-file
review: my services have no UI of their own most of the time. They are called
from:

| Caller | What it uses |
|---|---|
| M2's `POST /leave/apply`, `/forecast`, `/leave/:id/shorten` | `calculationService.computeDays`, `weekendConfigService.workingDaysFor`, `staffingService.blackoutForRange` |
| M2's `POST /leave/coverage-check`, `GET /leave/team-calendar` | `services/coverage.js` directly — this is UC-07's actual entry point |
| M3's `routes/swap.js` | `calculationService` + `weekendConfigService`, so a swap recomputes duration the same way an apply does |
| M5's `services/carryForwardService.js` / reporting | `leaveYearService` is arguably adjacent to this vertical (it also decides "what counts as the current period") but is documented as M5's — see their schema doc for the actual ownership call |
