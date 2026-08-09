# Use Cases — Member 2 (Employee Leave Experience)

**Author:** Jervis · Member 2
**Owned use cases:** UC-01 · UC-03 · UC-05 · UC-08 (staff view) · UC-13 · UC-14 · UC-27 · AI-1

My vertical is the employee's whole journey: asking for leave, seeing what it will
cost, tracking it, correcting it, and trading dates with a teammate. Two of these
flows also run on the Supervisor, Manager and HR screens, because a change to
*approved* leave has to be decided by someone other than the person asking.

---

## Actors that touch my use cases

| Actor | Where they appear in my flows |
|---|---|
| **Employee** | The primary actor for all of them |
| **Supervisor** | Tier 1 of any change to approved leave (cancellation, early return, swap); views a certificate when deciding |
| **Manager** | Tier 2, final; the balance moves only on their approval |
| **HR Admin** | Corrects leave that has already started; chases missing certificates. Applies for leave like any employee |
| **Boss** | Decides a Manager's own leave; their own leave is decided by any Manager |
| **System** | Recomputes chargeable days, expires stale swap proposals, writes the audit trail |

A design rule that runs through all of them: **an approver may apply for their own
leave, but never decide it.** Where a request enters the chain is decided by
`services/approvalChain.js`, not by a hard-coded role check — a Supervisor's own
leave starts at the Manager tier, a Manager's goes up to the **Boss**, and the
Boss's goes back down to the Manager tier (any Manager, company-wide, since the
Boss sits above every team). `canActOn()` enforces this regardless of which
endpoint is called, including my cancellation and early-return routes.

---

## UC-01 — Apply for leave

**Actor:** Employee (or any role applying for themselves)
**Goal:** Submit a leave request that is guaranteed to be valid before an approver ever sees it.

**Main flow**

1. Employee picks a leave type, a date range, and optionally a half-day (AM or PM).
2. As they type, the system shows the chargeable days and their balance before and after (UC-14).
3. Employee adds a reason and submits.
4. The system validates the request, records it, and routes it to the correct approver tier.
5. The approver is notified.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| End date before start date | Refused with a plain message |
| Half-day on a multi-day range | Refused — half-days are single-day only, no hourly increments |
| Range is entirely weekend/holiday | Refused: "The selected range contains no working days" |
| Weekend or public holiday inside the range | Silently **not charged**; the forecast names each skipped day and why |
| Employee's country has a different weekend | Handled — day counting reads M4's per-country config, never a hard-coded Sat/Sun |
| Annual leave dated in the past | Refused. Sick leave may be back-dated up to 14 days (UC-05 is retroactive) |
| Two requests on the same dates | Refused as a double booking, naming the clashing request |
| AM half-day + PM half-day on one date | **Allowed** — the one genuine overlap that is not a double booking |
| Not enough balance | Refused, and pending requests already count against the balance |
| Leave type not offered in their country, or gender-restricted | Refused by M5's catalogue rules |
| Dates inside a blocked period | Refused (M4, UC-18) |
| Dates inside a special-approval period, or coverage below threshold | Submits, but `flagged` — the Manager must acknowledge the exception |
| Submit clicked twice / response lost | An idempotency key returns the original request instead of creating a duplicate |
| Applicant is a Supervisor/Manager/HR Admin | Routed to a tier that can decide it without a conflict of interest |

---

## UC-03 — Cancel, or return early from, leave

**Actor:** Employee · **Approvers:** Supervisor then Manager · **Fallback:** HR Admin

This use case has three distinct paths, because the correct behaviour depends
entirely on how far the leave has got.

### 3a. Withdrawing a request that is still pending

Nothing has been deducted yet, so it is cancelled immediately and no approval is
needed. The approvers who had it in their queue are told it is gone.

### 3b. Cancelling leave that is already approved

The days have already come off the balance, and someone else may have planned
around the absence. So a cancellation of approved leave is itself a request:

1. Employee clicks **Request cancellation**.
2. The request re-enters the approval chain at the tier it originally started at, tagged as a cancellation.
3. Supervisor endorses → Manager finalises.
4. **Only on final approval** does the status become `CANCELLED` and the days return.
5. If either tier refuses, the leave stands and the balance is untouched.

A coverage flag needs no exception here: cancelling leave *frees* coverage, it
never reduces it — so the Manager is not asked to acknowledge one.

### 3c. Returning early from approved leave

The common real case: a 5-day holiday where the employee comes back on Wednesday.
Cancelling the whole thing and re-applying would be wrong — it would lose the
approval and mis-state the days actually taken.

1. Employee clicks **Return early** and picks the new last day.
2. The system works out what the shorter range costs under their own country calendar, and therefore how many days would come back.
3. The change routes Supervisor → Manager, shown to them as an **early return**, not a cancellation.
4. On approval the leave **stays approved**, the end date moves, and only the difference is returned.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Leave has already started | Employee is refused and told to ask HR (see 3d) |
| Cancellation already in flight | Refused — one decision at a time |
| New end date outside the original range | Refused |
| New end date equals the current one | Refused: "nothing to shorten" |
| Trimming only weekends/holidays | Refused — it would free no chargeable day |
| Trimming *every* working day | Refused, and the employee is pointed at full cancellation instead |
| Half-day request | Cannot be shortened; cancel it instead |
| Cancellation racing an approval | Prevented — the state change holds a row lock |
| Already rejected or cancelled | Refused with the reason |

### 3d. HR corrects leave that has already started

Once an absence is under way the employee's own calendar is history, so it becomes
HR's correction rather than a request. HR shortens it to the day the employee
actually returned, or voids it entirely. This applies immediately with no approval
chain, requires a written reason, and is recorded in the audit trail. The employee
is notified with the reason and the number of days returned.

---

## UC-05 — Sick leave

**Actor:** Employee

Sick leave differs from annual leave in three ways, all enforced server-side:

1. **It is retroactive.** You fall ill first and file afterwards, so back-dating is allowed — up to 14 days. Beyond that it becomes an HR record-keeping matter.
2. **Quotas are per country and per sub-type.** Singapore, Vietnam and Thailand grant different amounts with and without a certificate.
3. **Some countries grant nothing without a certificate.** Thailand allows 30 days with an MC and **zero** without.

**Edge case worth calling out.** A Thai employee choosing "sick leave without MC"
used to get "insufficient balance", which is technically true and completely
unhelpful. It now explains the actual policy and points at the option that works:

> *Thailand policy grants no sick leave without a medical certificate. Choose "Sick leave (with MC)" and attach your MC.*

---

## UC-08 — Personal calendar and leave history *(staff view)*

**Actor:** Employee

Shows the employee their own balances, their requests from the last 12 months with
the audit trail, and the team's approved leave so they can plan around colleagues.

**Privacy edge case:** the team calendar returns **dates only — never leave types.**
A colleague needs to know *that* someone is away, not that they were off sick.

---

## UC-13 — Medical certificate upload *(Enhanced)*

**Actors:** Employee (uploads) · Supervisor/Manager/HR (view) · HR (chases what is missing)

**Main flow:** the employee attaches a PDF, JPG or PNG when applying for sick leave
that requires one; approvers and HR can open it when deciding.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Certificate not ready at filing time | Can be attached later, while the request is still open, without cancelling and re-applying |
| Replacing a wrong upload | Allowed while open; audited as a replacement |
| Wrong file type | Refused server-side — the browser's `accept` attribute is not validation |
| File too large | Refused with a size message; the body limit returns a readable error rather than an HTML error page |
| Someone else's certificate | `403` — only the owner, the team's approvers, or HR may view it |
| Request already decided | No further uploads |
| Sick leave with no certificate that should have one | Appears on HR's **Certificates outstanding** list |

The compliance list covers two situations: the leave type always requires a
certificate, or the absence ran longer than self-declaration covers.

---

## UC-14 — Balance forecast, drafts, status tracker, calendar export *(Enhanced)*

**Actor:** Employee

### Balance forecast ("what-if")

Before committing, the employee sees the chargeable days, every skipped day
labelled `PUBLIC_HOLIDAY` or `NON_WORKING_DAY`, and their balance before → after.
Nothing is saved. Rules that would *refuse* a submission appear here as warnings
instead — the forecast informs, it never blocks.

### Drafts

A half-finished request is stored privately and is not routed to anyone.

**Edge case that mattered:** a draft must not be a way around the rules. Editing a
draft's dates recomputes its day count, and submitting a draft runs the *identical*
rule set as applying directly — both call the same helper, so the two paths cannot
drift apart.

### Status tracker

Submitted → Supervisor → Manager, with the timestamp and the name of whoever acted,
read from the audit trail. It re-labels itself when the pending cycle is a
cancellation or an early return rather than a new application.

### Calendar export

Approved leave downloads as an `.ics` file that opens in Outlook or Google Calendar.
Owner only, approved only.

**Edge cases:** all-day events need an *exclusive* end date (add one day, or the
last day is missing); half-days become timed events over Singapore office hours;
text is escaped per RFC 5545 so a reason containing a comma or semicolon does not
corrupt the file.

---

## UC-27 — Leave swap *(Enhanced)*

**Actors:** two Employees on the same team · Supervisor then Manager

**Goal:** two colleagues trade date ranges. **Dates swap; balances do not.**

**Main flow**

1. Employee picks one of their approved future leaves and a teammate's.
2. The teammate accepts (or declines, or lets it expire after 48 hours).
3. Supervisor endorses → Manager approves.
4. Both date ranges are exchanged atomically.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Entries cost different numbers of days | Refused — a swap must not move either balance |
| Employees in different countries | Each side's cost is **recomputed for the other's dates under their own calendar**; a swap that looks equal can still drift because SG, VN and TH have different holidays |
| Leave in the past | Only future leave can be swapped |
| Different teams | Refused — swaps stay within one approval chain |
| Duplicate proposal for the same pair | Refused |
| Either entry cancelled while the swap sat in the queue | Re-verified inside the approval transaction and refused |
| Either entry awaiting a cancellation decision | Refused |
| Proposal ignored | Expires after 48 hours, applied lazily on read — no cron job |
| Partial failure during the swap | Impossible: both rows change inside one transaction, or neither does |

---

## AI-1 — Natural-language leave application

**Actor:** Employee

**Goal:** type "Half day tomorrow afternoon for a dental appointment" and have the
form fill itself in.

**Main flow:** the employee describes their leave, the system extracts type, dates,
half-day and period, and pre-fills the form with a confidence score. The employee
reviews and submits.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| No AI key configured / no internet | Falls back to an offline regex parser; the feature still works, `source` says `heuristic` |
| AI provider is slow, down, or returns nonsense | Times out and falls back deterministically; the employee never sees a raw provider error |
| Model gets the weekday wrong | Dates are **re-checked server-side** against the employee's own calendar and a warning is attached |
| Parsed date is a public holiday | "…is a public holiday (National Day) — no leave is needed." |
| Several requests in one sentence | Split into separate entries ("Monday off, then a half day on Friday" is two) |
| Employee writes in another language | Understood; the reason is written back in English because the supervisor reads it |
| Nothing recognisable | Returns no requests rather than guessing |

**Design boundary:** AI-1 **only pre-fills the form.** Nothing is ever submitted
from a parse, and every parse is recorded for the audit trail. The AI is a typing
shortcut, never an authority — no rule in any other use case is relaxed because
the AI produced the values.
