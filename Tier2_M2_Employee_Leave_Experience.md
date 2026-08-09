# Tier 2 Implementation Notes — Member 2

## Vertical: Employee Leave Experience

> **Owner:** Member 2 (M2) · **Project:** Innovare Leave Management System (SCCCI AI Challenge 2B, Group 4)
> **Use cases:** UC-01 (apply) · UC-03 (cancellation) · UC-05 (sick leave) · UC-08 staff view · UC-13 (MC upload) · UC-14 (drafts, status tracker, forecast, `.ics`) · UC-27 (leave swap) · AI-1
> **Companion to:** `Tier3_M3_Approval_Delegation_Notification.md` — same conventions: no new runtime dependencies, no new response envelope, Sequelize models + `sync({ alter: true })`, `yup` validation, `audit()` on every state change.

---

## 1. What this round changed

The base M2 vertical already had: the apply form (full/half-day AM-PM), the personal calendar and history, drafts, the MC attachment, the swap state machine and AI-1 natural-language parsing. This round closed the gaps between that code and the specification, and finished the Enhanced items that were still missing.

### 1.1 Correctness gaps closed

| # | Gap | Why it mattered | Fix |
|---|-----|-----------------|-----|
| 1 | **UC-03 was half-implemented.** `PUT /leave/:id/cancel` rejected anything that was not `PENDING_*`, so approved leave could never be withdrawn and a deducted balance could never come back. | The use case explicitly requires "approved → cancellation routes through Supervisor → Manager; balance restored on approval". This was a missing Core requirement, not polish. | New `cancellationRequested` flag on `leave_requests`. An approved request re-enters `PENDING_SUPERVISOR` carrying the flag; `decideCancellation()` runs the withdrawal through both tiers, restores `used` on final approval, and snaps the request back to `APPROVED` if either tier refuses. |
| 2 | **Nothing stopped double booking.** An employee could submit two requests over the same dates. | Two overlapping approved leaves corrupt coverage maths for M3/M4 and the balance for M5. | `rules.overlapCheck()` blocks any overlap with the employee's own live requests, while still allowing the genuine case of an AM half-day plus a PM half-day on one date. |
| 3 | **Editing a draft left a stale `days` value.** `PUT /leave/drafts/:id` changed the dates but never recomputed the day count, so submitting used the old number. | Wrong balance deduction — silent and hard to spot. | Draft edit recomputes `days`; draft submit now runs the *identical* rule set as `POST /leave/apply` (see §2.1). |
| 4 | **Draft submission bypassed rules.** `POST /leave/drafts/:id/submit` had its own, thinner copy of the checks. | A draft was a way around validation. | Both paths call one `prepareSubmission()` helper. Divergence is now impossible by construction. |
| 5 | **A swap could move both balances.** UC-27 says "dates swap, not days", but nothing checked that the two entries cost the same, and teammates can sit in different countries (the demo team spans SG/VN/TH) with different holiday calendars. | Swapping a 1-day with a 3-day entry silently changed two people's leave balances. | `rules.swapCompatible()` requires equal cost, future dates, and re-derives each employee's day count for the *other's* dates under their own country calendar. Re-verified inside the paired transaction at Manager approval. |
| 6 | **Duration was computed locally.** M2 used `services/coverage.js`, which hard-codes Saturday/Sunday. | It ignored M4's per-country weekend configuration (UC-29) — the cross-cutting contract says M2 must *call* M4's calculation, never re-implement it. | All M2 day counting now goes through `calculationService.workingDaysInRange()` + `weekendConfigService.workingDaysFor()`. |
| 7 | **Any file type could be stored as an MC.** Only the browser's `accept` attribute filtered it. | Server-side validation is the only real validation. | `rules.attachmentCheck()` enforces PDF/JPG/PNG, a `data:` URL, and the size cap on every path. |
| 8 | **Leave could be applied for the past.** No date-floor check at all. | Annual leave in the past is a data-entry error; sick leave in the past is normal (UC-05 is retroactive). | `rules.backdateCheck()`: annual must start today or later; sick may be back-dated up to 14 days. |
| 9 | **Thailand's sick quota produced a confusing error.** TH grants 30 days with an MC and 0 without, so a TH employee got "insufficient balance". | Multi-country policy is a headline demo point; the message should explain the policy. | `rules.sickQuotaCheck()` returns the policy reason and points to the MC option. |
| 10 | **Timezone drift.** "Today" came from `new Date().toISOString()` (UTC). | Between 00:00 and 08:00 SGT that is yesterday, so every date comparison could be a day out. | `rules.sgtTodayISO()` — HQ time (UTC+8) regardless of where the server runs. |

### 1.2 Enhanced (E) features finished

- **Balance forecast / what-if (UC-14)** — `POST /leave/forecast`: chargeable days, every skipped day labelled `PUBLIC_HOLIDAY` or `NON_WORKING_DAY`, balance before → after, and advisory warnings. Nothing is persisted. The apply form now shows *"Now: 9.5 days → After this request: 7.5 days"* live.
- **`.ics` calendar export (UC-14)** — `GET /leave/:id/ics`, owner-only, approved leave only. Hand-rolled RFC 5545 output in `services/icsService.js` (no new dependency): full days become all-day events with the exclusive `DTEND`, half-days become timed events over Singapore office hours.
- **Status tracker (UC-14)** — `client/src/components/StatusStepper.jsx` renders Submitted → Supervisor → Manager with the timestamp and actor of each stage, read from the audit trail `GET /leave/mine` already returns. It re-labels itself for a cancellation cycle.
- **Late MC attachment (UC-13)** — `POST /leave/:id/attachment` lets the employee add or replace the certificate while the request is still open, which is what actually happens with retroactive sick leave. Audited.

---

## 2. Files added / modified

**Added**

| File | Purpose |
|------|---------|
| `server/services/leaveRules.js` | All M2 business rules as pure functions: SGT dates, overlap, back-dating, sick quota, attachment validation, balance forecast, swap compatibility. |
| `server/services/icsService.js` | RFC 5545 `.ics` generation (pure). |
| `client/src/components/StatusStepper.jsx` | UC-14 status tracker. |
| `server/tests/m2.leaveRules.test.js` | 32 pure-function unit tests (no DB). |
| `server/tests/api.m2.integration.test.js` | 9 supertest tests over the real API. |

**Modified**

| File | Change |
|------|--------|
| `server/models/LeaveRequest.js` | `+ cancellationRequested` (additive; `sync({ alter: true })` adds the column). |
| `server/routes/leaveRequest.js` | `prepareSubmission()`, `decideCancellation()`, calculation-service integration, `/forecast`, `/:id/ics`, `POST /:id/attachment`, rewritten `/:id/cancel`, draft fixes, pending-days that exclude cancellation cycles. |
| `server/routes/swap.js` | Compatibility guard, duplicate-proposal guard, future-dated `/eligible`, re-verification inside the transaction. |
| `client/src/pages/Employee.jsx` | Forecast panel, status tracker, "Request cancellation", "Add to calendar", "Attach MC", equal-length swap picker, cancellation-aware status chips. |
| `client/src/pages/Approver.jsx` | Cancellation requests are labelled in the queue, explained in a banner, and get their own button/confirm copy; no coverage-exception tick is demanded for them. |
| `server/package.json` | `test` → `jest --runInBand` (the DB-backed suites cannot run in parallel workers against one MySQL schema). |
| `server/README.md` | Route list updated. |

### 2.1 One rule set, two entry points

```
POST /leave/apply ─┐
                   ├─► prepareSubmission(user, data)
POST /leave/drafts/:id/submit ─┘
        │
        ├─ date order, half-day = single day
        ├─ rules.backdateCheck            (UC-01 / UC-05)
        ├─ calculationService.workingDaysInRange  (M4 contract, UC-19 + UC-29)
        ├─ rules.sickQuotaCheck           (UC-05, country policy)
        ├─ MC required + rules.attachmentCheck    (UC-13)
        ├─ rules.overlapCheck             (UC-01)
        ├─ rules.forecastBalance          (balance incl. pending)
        ├─ staffingService.blackoutForRange       (M4, UC-18)
        └─ coverage.evaluateCoverage      (AI-2 flag)
```

---

## 3. New / changed API contracts

**`POST /leave/forecast`** — EMPLOYEE. Body `{ leaveType, startDate, endDate, halfDay }`.

```json
{
  "days": 4,
  "workDays": ["2026-08-10", "2026-08-11", "2026-08-13", "2026-08-14"],
  "skipped": [{ "date": "2026-08-12", "reason": "PUBLIC_HOLIDAY" }],
  "balance": { "entitled": 14, "carried": 5, "used": 7.5, "pending": 1,
               "remainingBefore": 10.5, "remainingAfter": 6.5, "sufficient": true },
  "warnings": []
}
```

**`PUT /leave/:id/cancel`** — EMPLOYEE, owner.

- pending → `{ "cancelled": true, "message": "…" }`, status `CANCELLED`, balance untouched.
- approved → `{ "cancelled": false, "pendingApproval": true, "request": { … } }`, status `PENDING_SUPERVISOR` with `cancellationRequested: true`.
- already started, already cancelling, rejected/cancelled → `400` with the reason.

**`POST /leave/:id/attachment`** — EMPLOYEE, owner, open requests only. Body `{ attachmentName, attachmentType, attachmentData }` (data URL). `400` on a non-PDF/JPG/PNG type or an oversize file.

**`GET /leave/:id/ics`** — EMPLOYEE, owner, `APPROVED` only. `text/calendar` attachment. `403` for anyone else, `400` if not approved.

**`GET /swap/eligible`** — now returns `days` per entry and lists only future, non-cancelling approved leave. `POST /swap` returns `400` when the two entries would not cost the same.

---

## 4. Test coverage

```bash
cd server && npm test
```

- `tests/m2.leaveRules.test.js` — 32 unit tests, no database: SGT dates, overlap (including the AM+PM case), back-dating windows, Thailand's sick policy, attachment types, forecast arithmetic (half-day precision, the exact-zero boundary), swap compatibility including cross-country drift, and `.ics` output (exclusive `DTEND`, half-day slots, CRLF, RFC escaping).
- `tests/api.m2.integration.test.js` — 9 API tests against the seeded database, including the full UC-03 loop: apply → Supervisor → Manager → balance deducted → request cancellation → **Supervisor refuses, leave stands, balance unchanged** → request again → both approve → `CANCELLED` with the days restored. Fixtures pick dates through M4's calculation service so a public holiday never fails a test for the wrong reason, and the seed balance is restored in `afterAll`.

**Known unrelated failure:** `tests/api.m3.integration.test.js` (16 tests) fails with `401` on every authenticated call. Its `login()` helper reads `res.body.accessToken`, but M1's mandatory two-step verification now makes `POST /user/login` return a challenge instead. The helper needs to follow up with `POST /user/2fa/send` and `POST /user/2fa/verify` (the response carries `demoCode` when no SMTP/SMS provider is configured). This predates the M2 work and is M3/M1's file.

---

## 5. Demo script for the M2 slice

1. **Forecast** — type dates on the apply form: *"4 days will be deducted"*, the skipped public holiday is named, and *"Now 10.5 → After this request 6.5"* updates live.
2. **AI-1** — *"Half day tomorrow afternoon for a dental appointment"* → the form fills in, PM half-day selected, and the parsed JSON is shown with its confidence and source.
3. **Double booking** — submit the same dates twice: *"You already have leave on these dates (REQ-42, …)"*.
4. **Thailand policy** — log in as `somchai@innovare.com`, choose sick leave without an MC: *"Thailand policy grants no sick leave without a medical certificate…"*.
5. **Cancellation (UC-03)** — on an approved leave click **Request cancellation**: it re-enters the queue tagged *Cancellation request* (indigo). The Supervisor endorses, the Manager approves, and the days visibly return to the balance card. Reject at either tier instead and the leave stands, balance unchanged.
6. **Status tracker** — **Track progress** on any request shows Submitted → Supervisor → Manager with who acted and when.
7. **Calendar export** — **Add to calendar** on approved leave downloads an `.ics` that opens straight into Outlook/Google Calendar.
8. **Swap** — propose a swap: only equal-length future leave is offered, so both balances are provably unchanged after approval.
