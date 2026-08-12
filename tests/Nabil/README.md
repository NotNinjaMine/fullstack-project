# Tests — Member 5 (Nabil)

**82 tests across 3 suites, all passing.** No database, no network, no API key. The only setup they need is `npm install` plus a `server/.env.test` file (copy `server/.env.test.example`) — `jest.config.js` loads `setupEnv.js` before every suite in the project and it refuses to start without one, even for suites that never open a connection.

```
m5.leaveEligibility.test.js   26 tests   pure functions, no database
m5.forfeitureRisk.test.js     29 tests   pure functions, no database
m5.queryCatalogue.test.js     27 tests   pure functions, no database, no LLM
```

## Running them

From `server/`:

```bash
npx jest ../tests/Nabil
```

Or every suite in the project together:

```bash
npx jest
```

`server/jest.config.js` declares two roots, so `tests/<member>/` and `server/tests/` both run under one command — each member's suites are identifiable by folder while still being part of one green build.

---

## What is under test

| Suite | Covers | Use case |
|---|---|---|
| `m5.leaveEligibility.test.js` | Which leave types an employee may see and apply for — country scoping, gender restriction, inactive types, dropdown filtering, balance-tracking classification | UC-10 |
| `m5.forfeitureRisk.test.js` | Remaining-balance arithmetic, days at risk against a country's carry-forward cap, severity tiering, and the send/skip decision per employee | UC-31 |
| `m5.queryCatalogue.test.js` | The AI-4 offline classifier: catalogue integrity, question routing, and refusing to guess | UC-11 / AI-4 |

The first two import `server/services/leaveEligibility.js`; the third imports `server/services/queryCatalogue.js` directly, since `classifyOffline` was already pure.

---

## Why the rules were extracted into a module first

Two of these rules could not be tested where they lived.

The eligibility rule was a private function inside `routes/leaveRequest.js`. The forfeiture tiering was a local constant inside `carryForwardService.js`. Neither was exported, so reaching either meant standing up Express, MySQL, a seeded user and a valid JWT to assert on a boolean.

Extracting them into `server/services/leaveEligibility.js` did three things beyond making them testable.

**It removed a duplicated security rule.** The country/gender filter existed twice — once in `GET /leave/types` to build the dropdown, once in `POST /leave/apply` to enforce it. Two copies of the same rule are already free to drift; the test *the dropdown and the enforcement path agree on every type, for every user* now holds them together by construction.

**It fixed a real inconsistency.** Three places in my vertical tell HR who is at risk of forfeiting leave: the reminder email, the carry-forward summary report, and the AI-5 dashboard flag. Only the first read the country's configured `carryForwardMax` — the other two hard-coded `5`. On any country with a different cap, the email and the report disagreed about the same employee. All three now call `daysAtRisk()`. The final describe block in `m5.forfeitureRisk.test.js` is the regression guard.

**It left the I/O where it belongs.** The routes still do the database lookup and the HTTP response. Only the decision moved.

---

## Notable cases and why they exist

Most of these exist because of a specific way the code could plausibly break.

**`an empty array is treated identically to null, not as 'nowhere'`** — the HR panel submits `[]` when every country chip is cleared; the route normalises that to `NULL` on write. If the read path ever treated `[]` as "no countries", clearing the chips would silently disable a leave type company-wide, and the audit entry would look harmless.

**`an employee with no gender recorded fails closed on a restricted type`** — `users.gender` is nullable so accounts predating the column keep working. The dangerous direction is failing *open*: every legacy account would gain access to every restricted type. The paired test *an account with no gender still sees every unrestricted type* guards the opposite mistake, where failing closed accidentally locks someone out of ordinary annual leave.

**`country is checked before gender when both fail`** — a man in Malaysia is ineligible for maternity leave on two counts. He should be told his country does not offer it, because that is the actionable fact; being told his profile is wrong is both less useful and more intrusive.

**`rejects on gender with a message that does not disclose the restriction`** — asserts the message says "your profile" and explicitly does *not* match `/female|women/`. The employee learns they are ineligible without the error publishing the rule.

**`coerces the strings Sequelize returns for DECIMAL columns`** — the MySQL driver returns `DECIMAL` as a string. Without coercion `"14" + "5"` concatenates to `"145"` and every forfeiture figure in every email becomes nonsense. This is the failure least visible in a browser walkthrough and most embarrassing in an inbox.

**`honours a cap of zero for a country that carries nothing forward`** — guards a falsiness bug. The obvious `Number(cap) || 5` silently turns a real `0` into `5` and under-reports risk for that country by five days. The guard tests for absence explicitly instead.

**`boundaries are inclusive at the lower edge, exactly as documented`** — asserts `4.99 → warning` and `5.00 → critical` directly. An off-by-one would send "Important" to everyone sitting exactly on 5 days, contradicting the tier table in the API docs.

**`email and report still agree when a country configures a different cap`** — the regression test for the bug described above. With a 10-day cap the email used to say 2 days at risk while the report insisted on 7.

**`the dashboard flag never fires for someone the email would not contact`** — a property test across three caps and seven balances. The AI-5 threshold (3 days) is deliberately higher than the email threshold (1 day) so HR's panel is not filled with single-day noise; it must never be the other way round.

**`classifyOffline` returning `null` rather than guessing** — the whole AI-4 safety design rests on this. A wrong-but-confident match sends HR a chart answering a question they did not ask; `null` sends them the list of reports that do exist.

**`keywords are lowercase, because matching lowercases the question`** — a capitalised keyword can never match, so it would be dead config silently narrowing what the chatbot can answer, with no error anywhere.

### Two bugs these tests found

Writing the AI-4 suite surfaced two real classifier defects, both now fixed in `services/queryCatalogue.js`:

1. **"any anomalies i should know about?" scored zero and returned `null`.** The keyword list had `anomaly` but not `anomalies`, so the plural form — the more natural way to ask — matched nothing at all. Plural forms added.

2. **"which employees are at risk of forfeiture?" routed to `anomaly_flags` instead of `unused_balance_by_employee`.** Scoring awards a point per word in a matched keyword, so `at risk` (2) plus `risk` (1) outscored the lone `forfeiture` (1). A question explicitly about forfeiture reached the general risk panel instead of the forfeiture report. Fixed by adding the longer, more specific phrase `risk of forfeiture` to the forfeiture template, which wins under the same scoring rule rather than requiring a special case.

Neither would have shown up in a browser walkthrough — both return a plausible answer to a plausible question.

---

## What these tests deliberately do not cover

Stated plainly so the gaps are visible rather than assumed.

- **Wiring.** These assert the rules, not that the rules are called. A route that forgot to invoke `checkLeaveTypeEligibility` would pass every test here. The dropdown/enforcement agreement test narrows this, but only within the module.
- **Delivery.** That the forfeiture run actually sends an email, writes an in-app notification, and appends an audit row is not automated. It was verified by hand: a triggered run against the demo dataset produced 10 emails, 10 notifications and 10 correctly-tiered audit rows, confirmed by querying MySQL directly. A Supertest suite against a seeded test database with a stubbed mail transport is the obvious next step and the highest-value thing missing.
- **The LLM classification path.** Only `classifyOffline` is covered. The LLM refinement in `classify()` needs a provider key and is non-deterministic; it falls back to the offline result on any error, which is the behaviour that matters and is why the offline path is worth this much coverage.
- **Frontend components.** No React test setup in this build. `Admin.jsx`, `LongWeekendFinder.jsx` and `ForfeitureRiskForecast.jsx` were verified manually in a browser.
