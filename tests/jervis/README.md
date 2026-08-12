# Tests — Member 2 (Jervis)

**101 tests across 3 suites, all passing.**

```
m2.leaveRules.test.js        56 tests   pure functions, no database
m2.ai1Parse.test.js          27 tests   pure functions, no database
api.m2.integration.test.js   18 tests   real MySQL + real HTTP
```

## Running them

From `server/`:

```bash
npx jest ../tests/jervis
```

Or the whole project's suites together (mine plus every other member's) —
**413 tests, 30 suites**:

```bash
npx jest
```

> On Windows PowerShell, `&&` is not a valid separator. Run `cd server` as its
> own line first, then the `npx jest` command.

`server/jest.config.js` declares two roots, so `tests/<member>/` and
`server/tests/` both run under one command. Each member's own suites are
identifiable by folder while still being part of one green build.

### Prerequisites

83 of the 101 tests are pure functions and touch no database. Even so, **every
run needs `server/.env.test` to exist** — `jest.config.js` loads
`tests/setupEnv.js` before every suite, and it refuses to start without that
file rather than risk pointing at the demo database. Only the 18 integration
tests actually connect.

From `server/`:

```bash
cp .env.test.example .env.test   # then fill DB_PWD; APP_SECRET can stay blank
npm run seed:test                # creates and seeds leave_test
npx jest ../tests/jervis
```

The `leave_test` schema must already exist in MySQL:

```sql
CREATE DATABASE `leave_test`;
```

`tests/setupEnv.js` **refuses to run** unless `DB_NAME` contains "test", so the
suite can never be pointed at the demo database by accident. It also blanks every
AI key, so tests can never spend provider credit.

---

## Testing approach

Two deliberate choices, both of which shaped what the tests can catch.

**1. The business rules are pure functions.** Everything in
`services/leaveRules.js` takes plain values and returns `{ ok, message }` — no
database, no request object. That is why 83 of my 101 tests run on a clean
checkout with no MySQL, no seed data and no environment setup. Tests that need
infrastructure get skipped, and skipped tests catch nothing.

**2. The integration tests use the real API, not mocks.** `api.m2.integration.test.js`
drives Express through supertest against a real MySQL schema, because the bugs
that actually hurt were wiring bugs — a rule enforced in one path but not another,
a balance that moved twice, a column that stopped being carried through
middleware. A mocked database cannot see any of those.

Assertions follow one rule: **test the behaviour, not the implementation.** The
back-dating tests assert that the message mentions the past and points somewhere
useful, not its exact wording, so improving an error message does not fail the
suite while removing the rule does.

---

## Suite 1 — `m2.leaveRules.test.js` (56 tests)

Every employee-side business rule, as pure functions.

| Group | What it establishes |
|---|---|
| `sgtTodayISO` | "Today" is Singapore time, not the server's. Asserts that 20:00 UTC is already tomorrow in SGT — the bug where a UTC host shifted every date comparison by a day for the first eight hours of each SGT day. |
| `overlapCheck` (UC-01) | You cannot book two leaves at once; the message names the clashing request. **Includes the one legitimate overlap:** an AM half-day plus a PM half-day on the same date is allowed. |
| `backdateCheck` (UC-01/05) | Annual leave cannot start in the past; sick leave may be back-dated up to 14 days, because UC-05 is retroactive by nature. Boundary tested at exactly 14 and 15 days. |
| `sickQuotaCheck` (UC-05) | Thailand's 30-with-MC / 0-without policy produces a message explaining the policy and offering the option that works — not a bare "insufficient balance". |
| `attachmentCheck` (UC-13) | Only PDF/JPG/PNG; must arrive as a data URL; size cap enforced. Server-side, because the browser's `accept` attribute is not validation. |
| `forecastBalance` (UC-14) | `entitled + carried − used − pending`, with half-day precision preserved and the exact-zero boundary treated as sufficient rather than insufficient. |
| `swapCompatible` (UC-27) | Equal cost, future-dated, and **cross-country drift** — the same dates costing different days to an SG and a TH employee is refused, because UC-27 says balances never change. |
| `shortenCheck` (UC-03 ext.) | The new end date must sit inside the original range; the current end date is "nothing to shorten"; only approved leave qualifies. **The boundary the whole feature turns on:** an employee is refused once the leave has started and pointed at HR, while HR passing `allowStarted` is permitted — and is still bound by every other rule. |
| `shortenOutcome` (UC-03 ext.) | Only the *difference* in chargeable days comes back. Trimming every working day is reported as a full withdrawal, not a shortening. Trimming only weekends returns nothing. Half-day precision survives; missing inputs degrade to `0`, never `NaN`. |
| `mcComplianceGap` (UC-13 ext.) | Long self-declared sick leave is flagged; a short one is not; a certificate on file clears it however long the absence; cancelled, rejected and draft rows are never chased. |
| `icsService.buildIcs` (UC-14) | All-day events use the RFC 5545 **exclusive** `DTEND` (add one day, or Outlook shows the leave a day short); half-days become timed events over SGT office hours; CRLF line endings; commas and semicolons in a reason are escaped so the file cannot be corrupted by user text. |

### Two regression tests worth calling out

**The complementary half-day.** The naive overlap rule ("ranges intersect →
reject") blocks a genuine and common case: morning off for one thing, afternoon
off for another. The test pins the exception so a future tightening of the
overlap rule cannot quietly remove it.

**Cross-country swap drift.** Two teammates swapping equal-looking date ranges can
still move both balances if they sit in different countries, because a Thai public
holiday is a working day in Singapore. This is not obvious from reading the code
and is the reason `swapCompatible` takes a recomputed day count for each side
rather than comparing the stored `days` values.

---

## Suite 2 — `m2.ai1Parse.test.js` (27 tests)

AI-1's offline parser — the deterministic fallback used when no API key is set.

| Group | What it establishes |
|---|---|
| Leave type | "MC" and "medical certificate" select `sick_mc`; illness without one selects `sick_nomc`; everything else is annual. |
| Half-day handling | "afternoon" → PM, "morning" → AM; a half-day is always a single day; no hourly increments. |
| Dates | "tomorrow", "next Monday", explicit ranges; `endDate` defaults to `startDate`. |
| Reason and confidence | A reason is always produced; confidence reflects how certain the dates are. |
| Output shape | The parser's output is always shaped for the apply form, including when nothing is recognised — an empty result rather than a guess. |

The point of this suite is that **the AI feature is testable at all.** Because the
heuristic parser is deterministic and pure, AI-1 can be tested without a network
call, without an API key and without spending money — and it proves the feature
still works when the provider is unavailable.

---

## Suite 3 — `api.m2.integration.test.js` (18 tests)

Real HTTP against a real database. Each test walks a complete journey.

| Test | What it proves |
|---|---|
| Forecast returns days, skipped days, projected balance | `remainingAfter == remainingBefore − days`, and nothing is persisted |
| Forecast warns instead of failing on a back-dated range | The forecast informs, it never blocks |
| Annual leave cannot be back-dated | The rule survives the whole HTTP stack, not just the unit test |
| An MC must be a PDF/JPG/PNG | Server-side rejection of a disallowed type |
| A second request on the same dates is rejected | Double booking caught against real rows |
| Editing a draft recomputes its day count | The silent wrong-balance bug stays fixed |
| **Approved leave is withdrawn through the two-tier chain** | apply → Supervisor → Manager → balance deducted → request cancellation → **Supervisor refuses, leave stands, balance unchanged** → request again → both approve → `CANCELLED`, days restored |
| A pending request is still cancelled immediately | Nothing deducted, so no approval needed |
| `.ics` is owner-only and approved-only | `403` for anyone else, `400` if not approved |
| **An employee returns early** | Leave stays `APPROVED`, end date moves, and **only the difference** returns — 3 of 5 days |
| A refused early return changes nothing | Original dates and balance both untouched |
| An early return freeing no chargeable day is rejected | Trimming weekends returns nothing; trimming everything is a withdrawal instead |
| Only the owner can shorten their leave | `403` |
| **HR adjusts leave already under way** | The employee is refused and pointed at HR; a Supervisor gets `403`; HR succeeds immediately, days return, and the reason is in the audit trail |
| HR must give a reason, and cannot adjust unapproved leave | `400` on both |
| HR can void in-progress leave outright | Full balance returns |
| The MC compliance list flags long self-declared sick leave | HR-only (`403` for employee and approver), and **the certificate itself never appears in the payload** |
| A short self-declared absence is not chased | The threshold works in both directions |

### How the fixtures stay honest

Integration fixtures are the part of a suite most likely to lie, so three things
are deliberate:

- **Dates come from Member 4's calculation service, not from guessed weekday
  offsets.** A hard-coded "+100 days" eventually lands on a public holiday and the
  test fails for a reason unrelated to what it asserts. This actually happened:
  `plusDays(1)` landed on National Day.
- **Fixtures avoid Member 4's blackout windows.** Otherwise `/apply` correctly
  refuses them and the failure looks like a bug in my feature.
- **A failed fixture explains itself.** If setup cannot create its leave, the
  error prints the dates, the HTTP status, the server's message and every existing
  row — rather than a bare "expected 200, got 400" that sends you hunting through
  the feature instead of the setup.

`afterAll` restores the seeded balance and deletes every row the run created, so
the suite is repeatable and leaves the demo data as it found it.

---

## What is not covered

Stated plainly so the gaps are visible rather than assumed:

- **Frontend components.** There is no React test setup in this project; the UI
  was verified by hand in a browser and by a production build that must compile
  cleanly. A separate `checkUndefined` script (`client/npm run check:undefined`)
  catches undefined identifiers that the build cannot — it found five real dead
  buttons after the five-way merge.
- **Concurrency.** Balance updates now take a row lock, but there is no test that
  fires two simultaneous approvals to prove it. That is the highest-value test I
  would write next.
- **Real email/SMS delivery and live AI providers.** Both are stubbed by
  `setupEnv.js` on purpose — tests must not send mail or spend credit.
- **The cross-year boundary.** Leave spanning 31 December is charged entirely to
  the starting year. I know this is wrong; it is documented as a known limitation
  rather than silently untested.
