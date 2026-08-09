# API Documentation — Member 2 (Employee Leave Experience)

**Author:** Jervis · Member 2
**Scope:** the endpoints I own. Endpoints owned by other members (approval decisions,
coverage config, HR reporting, authentication) are documented in their own files;
where my flows hand over to theirs, the hand-off is noted.

**Base URL:** `http://localhost:3001` in development.

---

## Conventions

### Authentication

Every endpoint below requires a bearer token issued by M1's two-step sign-in:

```
Authorization: Bearer <accessToken>
```

`validateToken` rebuilds the caller from the **live** database row rather than
trusting the token body, so a role, team, country or gender change takes effect
immediately without the user signing in again.

### Role guard

`requireRole(...)` is enforced on the server. The UI hides controls a role cannot
use, but that is convenience only — every rule below is enforced again server-side,
so calling the API directly gains nothing.

### Error shape

Two shapes are returned, matching the rest of the project:

| Situation | Status | Body |
|---|---|---|
| Business-rule failure | `400` | `{ "message": "human-readable reason" }` |
| Schema validation failure (yup) | `400` | `{ "errors": ["leaveType is a required field"] }` |
| Not signed in / bad token | `401` | *(empty)* |
| Signed in but not permitted | `403` | *(empty)* or `{ "message": "..." }` |
| Row does not exist | `404` | *(empty)* |
| Upload larger than the body limit | `413` | `{ "message": "That file is too large..." }` |

Business-rule messages are written to be shown directly to the employee — they
explain *why* and what to do next, not just that something failed.

### Dates

All dates are `YYYY-MM-DD` strings. "Today" is **Singapore time** everywhere
(`services/businessTime.js`), never the server's own timezone — on a UTC host,
`new Date().toISOString()` is yesterday for the first eight hours of every SGT day,
which silently shifted every date comparison by one.

---

## 1. Applying for leave

### `POST /leave/apply` — UC-01, UC-05, UC-13, UC-14

Creates a leave request, or saves it privately as a draft.

**Roles:** EMPLOYEE, SUPERVISOR, MANAGER, HR_ADMIN, BOSS
*(Approvers may apply for their own leave; it routes to a tier that has no conflict
of interest — see the routing note below.)*

**Optional header:** `Idempotency-Key: <uuid>` — a retried submit after a lost
response returns the original request instead of creating a duplicate.

**Request**

```json
{
  "leaveType": "annual",
  "startDate": "2026-11-16",
  "endDate": "2026-11-20",
  "halfDay": false,
  "halfDayPeriod": null,
  "reason": "Family holiday",
  "isDraft": false,
  "attachmentName": "mc.pdf",
  "attachmentType": "application/pdf",
  "attachmentData": "data:application/pdf;base64,JVBERi0..."
}
```

| Field | Type | Notes |
|---|---|---|
| `leaveType` | string, required | Must be active, offered in the caller's country, and allowed for their profile (M5's catalogue) |
| `startDate` / `endDate` | `YYYY-MM-DD`, required | End must be on or after start |
| `halfDay` | boolean | Only valid when start and end are the same day |
| `halfDayPeriod` | `AM` \| `PM` | Required when `halfDay` is true |
| `reason` | string, required | 3–200 characters |
| `isDraft` | boolean | `true` stores it privately without routing it |
| `attachment*` | string, optional | Base64 data URL; PDF/JPG/PNG only, ~5 MB cap |

**Success `200`**

```json
{
  "request": { "id": 142, "status": "PENDING_SUPERVISOR", "days": 5, "...": "..." },
  "flagged": false,
  "conflicts": [],
  "blackout": undefined
}
```

`flagged: true` means coverage fell below the threshold or the dates hit a
special-approval blackout window — it still submits, but the Manager must
acknowledge the exception explicitly.

**Errors `400`**

| Message | Cause |
|---|---|
| `End date must be on or after the start date.` | Range inverted |
| `Half-day is only allowed for single-day requests.` | `halfDay` on a multi-day range |
| `Annual leave cannot start in the past (…). Pick today or a future date.` | Back-dated annual leave |
| `Sick leave can only be back-dated up to 14 days…` | Sick leave older than the window |
| `The selected range contains no working days.` | Entire range is weekend/holiday for that country |
| `Thailand policy grants no sick leave without a medical certificate…` | Country grants 0 days for that type |
| `<Type> requires an attached medical certificate.` | Type is flagged `requiresMc` |
| `Medical certificates must be a PDF, JPG or PNG file.` | Disallowed attachment type |
| `You already have leave on these dates (REQ-42, …)…` | Overlaps the caller's own live leave |
| `Insufficient balance: requesting 5 day(s) but only 3 remain…` | Balance, including pending requests |
| `Leave cannot be applied for … these fall inside a blocked period…` | M4 blackout, BLOCK mode |

**Routing note.** The entry stage comes from `services/approvalChain.js`, never
from a hard-coded role check:

| Applicant | Enters at | Finally decided by |
|---|---|---|
| EMPLOYEE, HR_ADMIN | `PENDING_SUPERVISOR` | own-team Manager |
| SUPERVISOR | `PENDING_MANAGER` | own-team Manager |
| MANAGER | `PENDING_BOSS` | the Boss |
| BOSS | `PENDING_MANAGER` | any Manager, company-wide |

The same table governs my cancellation and early-return routes, so a Manager
returning early is reviewed by the Boss rather than by a peer.

---

### `POST /leave/forecast` — UC-14 (Enhanced)

Answers "what would this cost me?" before committing. **Nothing is persisted.**

**Roles:** EMPLOYEE, SUPERVISOR, MANAGER, HR_ADMIN, BOSS

**Request**

```json
{ "leaveType": "annual", "startDate": "2026-11-16", "endDate": "2026-11-20", "halfDay": false }
```

**Success `200`**

```json
{
  "leaveType": "annual",
  "startDate": "2026-11-16",
  "endDate": "2026-11-20",
  "halfDay": false,
  "days": 4,
  "workDays": ["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20"],
  "skipped": [{ "date": "2026-11-18", "reason": "PUBLIC_HOLIDAY" }],
  "weekendConfig": { "mon": true, "sat": false, "sun": false },
  "balance": {
    "entitled": 14, "carried": 5, "used": 7.5, "pending": 1,
    "remainingBefore": 10.5, "remainingAfter": 6.5, "sufficient": true
  },
  "warnings": []
}
```

`skipped` names every calendar day that is **not** charged and why, so the
employee can see holidays are never deducted. `warnings` carries the same
messages `/apply` would refuse with, phrased as advice rather than errors — the
forecast informs, it never blocks.

---

## 2. Drafts — UC-14

| Endpoint | Roles | Purpose |
|---|---|---|
| `GET /leave/drafts` | EMPLOYEE+ | The caller's own saved drafts |
| `PUT /leave/drafts/:id` | EMPLOYEE+ (owner) | Edit in place; **recomputes `days`** |
| `POST /leave/drafts/:id/submit` | EMPLOYEE+ (owner) | Promote to a live request |
| `DELETE /leave/drafts/:id` | EMPLOYEE+ (owner) | Discard |

**`PUT /leave/drafts/:id`** accepts the same fields as `/apply` (all optional).
Editing the dates recomputes the chargeable day count — leaving a stale `days`
value behind was a real bug: the draft submitted with the old number and deducted
the wrong balance silently.

**`POST /leave/drafts/:id/submit`** runs the **identical** rule set as
`POST /leave/apply` by calling the same `prepareSubmission()` helper. A draft
therefore cannot be used to bypass a back-dating, overlap, quota, balance,
blackout or coverage rule. Divergence between the two paths is impossible by
construction rather than by discipline.

**Errors:** `400 Only drafts can be edited here.` · `400 Add a reason (at least 3
characters) before submitting this draft.` · `403` if not the owner · `404` if
no such row.

---

## 3. Cancelling and returning early — UC-03

### `PUT /leave/:id/cancel`

**Roles:** EMPLOYEE, SUPERVISOR, MANAGER, HR_ADMIN, BOSS — **owner only.**

Behaviour depends on where the request is:

| State | Result |
|---|---|
| `PENDING_*` | Withdrawn immediately → `CANCELLED`. Balance untouched (nothing was deducted yet). |
| `APPROVED`, not started | Becomes a **cancellation request** that routes Supervisor → Manager again. Days return only on final approval. |
| `APPROVED`, already started | `400` — "ask HR to adjust it instead" (see `/hr-adjust`). |
| `REJECTED` / `CANCELLED` | `400` with the reason. |

**Success `200` (pending)**

```json
{ "cancelled": true, "message": "REQ-42 cancelled. Submit a new request to change dates or leave type." }
```

**Success `200` (approved)**

```json
{
  "cancelled": false,
  "pendingApproval": true,
  "request": { "status": "PENDING_SUPERVISOR", "cancellationRequested": true },
  "message": "Cancellation requested for REQ-42. Your Supervisor and Manager must approve before the 5 day(s) return to your balance."
}
```

The whole state change runs inside a transaction with a row lock, so a
cancellation racing an approval cannot both land.

---

### `PUT /leave/:id/shorten` — UC-03 (extended)

"I'm coming back early." The leave is **not** cancelled — its end date is pulled
back and only the days no longer taken are returned.

**Roles:** EMPLOYEE, SUPERVISOR, MANAGER, HR_ADMIN, BOSS — **owner only.**

**Request:** `{ "newEndDate": "2026-11-18" }`

**Success `200`**

```json
{
  "pendingApproval": true,
  "request": { "status": "PENDING_SUPERVISOR", "cancellationRequested": true, "pendingEndDate": "2026-11-18" },
  "daysReturned": 3,
  "message": "Early return requested for REQ-135. Once approved, it will end 2026-11-18 and 3 day(s) return to your balance."
}
```

Like a cancellation, it re-enters the chain at the stage `approvalChain` dictates for the applicant's role. On final approval the end
date moves, `days` is recomputed against the employee's own country calendar, and
**only the difference** comes off `used`. On refusal the original dates stand.

**Errors `400`**

| Message | Cause |
|---|---|
| `Only approved leave can be shortened.` | Not in `APPROVED` |
| `That is already the last day of this leave — nothing to shorten.` | No change |
| `The new end date must fall inside the original leave (…).` | Outside the range |
| `This leave has already started — ask HR to adjust it instead.` | Under way — HR's job |
| `A half-day request cannot be shortened — cancel it instead.` | Nothing to trim |
| `That would not free up any chargeable days…` | Only weekends/holidays trimmed |
| `That removes every working day. Use Request cancellation…` | Would be a full withdrawal |

---

### `PUT /leave/:id/hr-adjust` — UC-03 (extended), HR side

The other end of the same engine, and the endpoint that makes the "ask HR"
message above true. HR is the authority of last resort, so there is **no approval
chain** — the change applies immediately and is audited with the reason.

**Roles:** HR_ADMIN only.

**Request** — either shorten:

```json
{ "newEndDate": "2026-08-09", "reason": "Employee returned to the office early." }
```

…or void the whole absence:

```json
{ "cancelEntirely": true, "reason": "Recorded against the wrong employee." }
```

`reason` is required, 5–300 characters, and is written to the audit trail.

**Success `200`**

```json
{
  "request": { "id": 136, "endDate": "2026-08-09", "days": 1, "status": "APPROVED" },
  "daysRestored": 3,
  "message": "REQ-136 now ends 2026-08-09. 3 day(s) returned to Somchai Prasert."
}
```

Unlike the employee route, this one **may** act on leave that has already started
or finished — that is its entire purpose. All other rules (must be approved, new
end date inside the original range) still apply. The employee is notified with
the reason.

**Errors:** `403` for any non-HR caller · `400 Only approved leave can be
adjusted.` · `400` if neither `newEndDate` nor `cancelEntirely` is given.

---

## 4. Medical certificates — UC-13

### `GET /leave/:id/attachment`

Returns the stored certificate.

**Access rule (enforced server-side):**

```
the owner  OR  HR_ADMIN  OR  the team's SUPERVISOR/MANAGER   →  otherwise 403
```

**Success `200`:** `{ "name": "mc.pdf", "type": "application/pdf", "data": "data:application/pdf;base64,..." }`
**`404`** if the request has no attachment.

### `POST /leave/:id/attachment`

Adds or replaces the certificate while the request is still open. Sick leave is
often filed before the certificate is in hand (UC-05 is retroactive), so the
employee must be able to add it afterwards without cancelling and re-applying.

**Roles:** owner only. **Body:** `{ attachmentName, attachmentType, attachmentData }`.

**Errors:** `400` once the request is decided · `400` on a non-PDF/JPG/PNG type
or an oversize file · `400` while a cancellation is pending.

### `GET /leave/mc-compliance` — UC-13 (extended)

Sick leave with no certificate on file that policy says should have one, so HR can
chase it rather than discovering the gap at year-end.

**Roles:** HR_ADMIN only.

**Success `200`**

```json
{
  "selfDeclarationLimit": 2,
  "count": 1,
  "outstanding": [
    {
      "id": 7,
      "employee": { "id": 4, "name": "Kumar Rajan", "team": "Compliance Team A" },
      "leaveType": "sick_mc",
      "startDate": "2026-08-12", "endDate": "2026-08-12",
      "days": 1, "status": "PENDING_MANAGER",
      "reason": "TYPE_REQUIRES_MC",
      "detail": "Sick Leave (with MC) always requires a certificate."
    }
  ]
}
```

`reason` is `TYPE_REQUIRES_MC` (the leave type always demands one) or
`EXCEEDS_SELF_DECLARATION` (the absence ran past what self-declaration covers).
The document itself is **never** included here — only the fact that it is missing.
`GET /leave/:id/attachment` remains the one way to see a certificate.

---

## 5. Calendar export — UC-14 (Enhanced)

### `GET /leave/:id/ics`

Downloads approved leave as an iCalendar file for Outlook or Google Calendar.

**Roles:** owner only (it carries their reason text). **`403`** for anyone else,
**`400`** if the leave is not approved.

**Response:** `Content-Type: text/calendar; charset=utf-8`,
`Content-Disposition: attachment; filename="leave-REQ-42-2026-11-16.ics"`

Full days become all-day events with the RFC 5545 **exclusive** `DTEND` (add one
day, or Outlook shows the leave a day short). Half-days become timed events over
Singapore office hours: AM `09:00–13:00`, PM `13:00–18:00`, expressed in UTC so no
`VTIMEZONE` block is needed. Written by hand in `services/icsService.js` — no new
runtime dependency.

---

## 6. My leave and balances — UC-08 (staff view)

| Endpoint | Roles | Returns |
|---|---|---|
| `GET /leave/mine` | EMPLOYEE+ | The caller's requests from the last 12 months, newest first, with the audit trail. Drafts excluded. |
| `GET /leave/balances` | EMPLOYEE+ | The caller's balances for the **active leave year** |
| `GET /leave/team-calendar` | EMPLOYEE, SUPERVISOR, MANAGER | Teammates' approved leave — **dates only, no leave types** |

The team calendar deliberately exposes no leave types: a colleague needs to know
*that* someone is away to plan around it, not that they were off sick.

---

## 7. Leave swaps — UC-27 (Enhanced)

Two employees trade date ranges. UC-27's rule is that **dates swap, balances do
not**, which the API enforces at three separate points.

| Endpoint | Roles | Purpose |
|---|---|---|
| `GET /swap/eligible` | EMPLOYEE+ | Teammates' future approved leave, with `days` so the UI can offer only equal-length entries |
| `POST /swap` | EMPLOYEE+ | Propose a swap — `{ myRequestId, counterpartRequestId }` |
| `GET /swap/mine` | EMPLOYEE+ | Proposals sent and received; expires stale ones on read |
| `PUT /swap/:id/accept` | counterpart | Accept → routes for two-tier approval |
| `PUT /swap/:id/decline` | counterpart | Decline |
| `GET /swap/pending` | SUPERVISOR, MANAGER | **Approver queue for swaps** |
| `PUT /swap/:id/decide` | SUPERVISOR, MANAGER | Endorse / final approve |

**Compatibility rules on `POST /swap` (`400` on any failure):**

- Both entries must be `APPROVED`, future-dated, and on the same team
- Neither may be awaiting a cancellation decision
- The two entries must cost the **same number of days**
- Each employee's day count is **recomputed for the other's dates under their own
  country calendar** — teammates sit in SG, VN and TH with different holidays, so
  an apparently equal swap can still move two balances
- No duplicate proposal may already be in flight for the same pair

**On Manager approval** the two date ranges are swapped inside a single
`sequelize.transaction` — either both change or neither. The equal-cost and
still-approved checks are **re-verified inside that transaction**, because either
entry may have been cancelled or withdrawn while the swap sat in the queue.

Proposals expire after 48 hours; the expiry is applied lazily on read, so no cron
job is needed.

---

## 8. AI-1: natural-language leave application

### `POST /ai/parse` *(alias: `POST /ai/parse-leave`)*

Turns plain English into structured leave fields. **Roles:** EMPLOYEE+.

**Request:** `{ "text": "Half day tomorrow afternoon for a dental appointment" }`

**Success `200`**

```json
{
  "requests": [{
    "leaveType": "annual",
    "startDate": "2026-08-10", "endDate": "2026-08-10",
    "halfDay": true, "halfDayPeriod": "PM",
    "reason": "Dental appointment",
    "confidence": 0.9,
    "workingDays": 0.5,
    "warning": null
  }],
  "language": "en",
  "source": "llm"
}
```

Three design points worth stating:

1. **It degrades, never fails.** With no API key configured, `source` is
   `"heuristic"` and an offline regex parser handles the common phrasings. The
   feature works with no internet and no spend.
2. **The AI is never trusted with the calendar.** Whatever produced the dates,
   `annotateWorkingDays()` re-checks them against the employee's own country
   calendar server-side and attaches a `warning` — language models are poor at
   weekday arithmetic, and a parsed date landing on a public holiday is caught
   before the employee submits.
3. **It only pre-fills the form.** Nothing is submitted from a parse; the
   employee reviews every field. The parse is also recorded in `ai_interactions`
   for the audit trail.

**Errors:** `400` if `text` is missing or longer than 500 characters.

---

## Hand-off points to other members

My flows stop at these boundaries, which is deliberate — I call their services
rather than re-implementing the logic:

| I call | Owner | For |
|---|---|---|
| `calculationService.workingDaysInRange()` | M4 | Chargeable days under each country's weekend config and holidays |
| `staffingService.blackoutForRange()` | M4 | Restricted-period checks on apply |
| `coverage.evaluateCoverage()` | M4 | The coverage flag (AI-2) |
| `PUT /leave/:id/decide` | M3 | The two-tier decision my cancellations and early returns route into |
| `notificationService` | M3 | Telling the right approver a request is waiting |
| `LeaveType` catalogue | M5 | Which leave types a given employee may pick |
| `validateToken` / `requireRole` | M1 | Authentication and role enforcement |

The one rule I hold to throughout: **M2 never re-implements day counting.** Every
chargeable-day number in my endpoints comes from M4's calculation service, so the
forecast, the balance deduction, the swap comparison and the early-return
arithmetic can never disagree with each other.
