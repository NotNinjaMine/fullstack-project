# Tests — Wei Jun (Member 4)

**Vertical:** Coverage, Calendar & Scheduling Rules
**AI feature:** AI-2 — Smart Coverage Analyzer

## What is in this folder

| File | Covers |
|---|---|
| `m4.coverage.test.js` | `services/coverage.js` — the AI-2 engine (UC-07): working-day maths, who's off on a given date, the coverage-threshold check, and the nearest-alternative-window search |
| `m4.calculation.test.js` | `services/calculationService.js` — the single source of truth for leave duration (UC-19), reading a per-country weekend map (UC-29) instead of a hard-coded Sat/Sun |
| `m4.blackoutAndWeekend.test.js` | `services/staffingService.js`'s `blackoutForRange` (UC-18) and `services/weekendConfigService.js`'s `workingDaysFor` (UC-29) — both DB-backed, so they're tested with the models mocked |

35 tests, all passing.

## How to run

From `server/`:

```bash
npx jest ../tests/WeiJun          # just these three files
npx jest                          # everything, alongside the other members' suites
```

The first two files need no database — they test pure functions. The third mocks
`../../server/models` the same way `server/tests/notificationPreferences.test.js`
does, so no test database is touched either. All three still run under the
project's normal `npx jest` from `server/`, because `server/jest.config.js`'s two
`roots` cover both `server/tests/` and `tests/<member>/`.

## Notable cases

- **`suggestAlternative` actually has to skip forward.** The first version of this
  test picked a team size where the fixed `MIN_PRESENT = 3` threshold could never
  be satisfied once the requester themself is subtracted — every window "failed"
  and the test asserted on a false premise. Rewritten with the HLD's own "3 of 5"
  team size and three overlapping leaves, so the search genuinely has to reject
  two candidate windows before landing on a clean one.
- **`isWorkingDay` is tested against two different weekend configs**, not just the
  Singapore default — a Fri/Sat weekend (as used by several Middle Eastern
  markets) is exactly the case `calculationService` exists to handle instead of
  assuming Sat/Sun everywhere.
- **The mutable-default-object test on `workingDaysFor`** exists because the
  function returns `{ ...DEFAULT_WORKING_DAYS }` — a spread, not the shared
  constant — specifically so one caller mutating its result can't corrupt the
  default for the next caller. The test mutates the first result and asserts the
  second call is unaffected.
- **The BLOCK-wins-over-SPECIAL_APPROVAL test** covers the actual UC-18 business
  rule: a range can be caught by both an advisory window and a hard block at the
  same time, and only the truly-blocked dates should be named back to the caller,
  not the whole requested range.

## What is not covered

- `blackoutForRange`'s `eachDay` date-expansion is only exercised indirectly
  through `blockedDates`, not tested in isolation.
- `leaveYearService.currentLeaveYear` (the active-leave-year resolver) is not
  covered here — it is DB-backed with an aggregate `MAX(year)` query, and Jervis's
  log (`ai/jervis/ai-logs/2026-08-09-final-debugging-and-balance-fix.md`) already
  covers a real bug in this exact function that this vertical should be aware of.
- No integration test exercises `GET /coverage/*` end-to-end against a live
  database — these suites test the coverage and calculation engines in isolation,
  not the routes that call them.
