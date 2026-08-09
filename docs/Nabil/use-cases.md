# Use Cases — Nabil Hady (Member 5)

**Vertical:** HR Admin, Analytics & Automation Engineer
**Project:** Annual Leave Management System — SCCCI AI Challenge, Problem 2B
**Owned use cases:** UC-10 (leave-type & country-policy configuration) · UC-11 · UC-21 · UC-22 · UC-30 · UC-31 · UC-32
**Owned AI features:** AI-4 (HR Insights Chatbot) · AI-5 (Anomaly & Risk Flags)
**Also owned:** database schema & migrations for the whole team

---

## Actors relevant to this vertical

| Actor | Relationship to my vertical |
|---|---|
| **HR Admin** | Primary actor for almost everything I own — configures leave types and country policies, reads the audit trail, runs reports, triggers forfeiture reminders, uses the AI chatbot and risk flags. |
| **Manager / Supervisor** | Secondary reader. Runs reports and schedules deliveries, but scoped to their own team rather than the whole company (UC-08 visibility). |
| **Employee** | Never configures anything. Consumes two outputs of my vertical: the forfeiture-risk forecast (UC-31) and long-weekend opportunities (UC-32), and is silently governed by the leave-type eligibility rules I own (UC-10). |
| **System (scheduler)** | Runs scheduled report delivery (UC-30) without a human trigger. |

**Role note.** The planned **HOD** tier was dropped. In its place the build added a **BOSS** role, which decides a Manager's own leave — no team peer could without a conflict of interest, and `PENDING_BOSS` is a real approval stage in `leave_requests.status`. Delivered roles: `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `HR_ADMIN`, `BOSS`. Every "HOD" in the original use-case text below reads as HR Admin or Boss depending on whether the action is administrative or an approval.

---

## UC-10 (my half): Leave-Type & Country-Policy Configuration

UC-10 is split. Jordon owns employee records and CSV staff import. I own the leave-type catalogue and the per-country policy table — the two config surfaces that decide *what leave exists* and *how much of it each country gets*.

**Primary actor:** HR Admin
**Trigger:** HR needs to add, retire, or re-scope a leave type, or adjust a country's statutory entitlements.

### Main flow — leave types

1. HR opens **Policies & types** in the admin panel.
2. The **Eligibility overview** heatmap renders every leave type against every country: green (everyone), rose (women only), sky (men only), grey (not offered).
3. HR opens a leave-type card and edits any of: display name, whether it draws down the annual balance, whether it draws down the sick balance, whether a medical certificate is mandatory, whether it is active, which countries offer it (multi-select chips), and which gender may apply (segmented control: Any / Male / Female).
4. HR saves. The change is written to `leave_types` and an entry is appended to the config audit log with full before/after values.
5. The employee-facing "Leave type" dropdown reflects the change on next load, per-employee.

### Main flow — country policy

1. HR opens the **Policies** table, one row per country.
2. HR edits annual minimum, annual maximum, sick-with-MC days, sick-without-MC days, and the year-end carry-forward cap.
3. On save, the policy is versioned into the audit trail. The carry-forward cap immediately becomes the threshold used by the carry-forward job (Jordon, UC-04), by my forfeiture-risk calculation (UC-31), and by the AI-5 forfeiture flag.

### Business rules

- A leave type with an empty or absent country list is offered **everywhere**. This is stored as SQL `NULL`, not an empty array, so the five leave types that existed before the field was introduced keep behaving exactly as they did.
- `genderRestriction` defaults to `ANY`. A restricted type is only offered to employees whose `gender` matches. Employees with no gender recorded do not see gender-restricted types at all — the rule fails closed.
- Eligibility is enforced **server-side on every write path**, not just hidden in the dropdown: on apply, on draft update, and again on draft submission. Filtering the dropdown alone would have been a UI-only control that a crafted request could walk straight past.
- Eligibility is re-checked at submit time even if it passed at draft time, because the catalogue may have changed while the draft sat unsubmitted.
- Types that draw down no balance (maternity, NS/reservist, unpaid, compassionate) skip the balance check on apply and the balance deduction on approval. There is no `leave_balances` row to deduct from, and requiring one would have made every new leave type a schema change.
- Only `HR_ADMIN` may write to either table. Any authenticated user may read the leave types they personally qualify for.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Employee has no gender recorded | Gender-restricted types are hidden and rejected server-side. Unrestricted types are unaffected. |
| Country list edited while an employee has a matching draft saved | Draft stays saved; submission is rejected with a specific message naming the type. |
| Leave type deactivated while requests are pending | Pending requests continue through approval untouched. Only new applications are blocked. |
| Leave type code that does not exist yet | `PUT /admin/leave-types/:code` uses find-or-create, so HR adds a type by saving one — no migration, no code change. |
| Country code that has no policy row | The multi-select only offers countries that exist in `leave_policies`, so an orphan reference cannot be created from the UI. |
| Two-letter country code in the wrong case | Normalised to uppercase on write; leave type codes are normalised to lowercase. |

### Delivered beyond the original use case

The original UC-10 said "configure country-specific leave policies" and stopped there. During the build it became clear that HR could not add maternity or NS leave without a developer, because leave types were a hard-coded enum. The catalogue was extended with `applicableCountries` and `genderRestriction` so HR can express "maternity leave, Singapore, women only" as configuration rather than as a code change. This is the single largest divergence from plan in my vertical, and it is deliberate.

---

## UC-11: HR Insights Chatbot (AI-4)

**Primary actor:** HR Admin (also Manager, scoped to their team)

### Main flow

1. HR opens the Dashboard. The insight chat sits at the top of the page — it is the first thing on screen, not a separate tab.
2. HR asks a question in natural language, or clicks one of the suggested questions.
3. The question is classified against a **fixed catalogue of parameterised queries**. Parameters (country, quarter, threshold, leave type) are extracted from the question.
4. The matched query runs against the database. The answer is returned as text, with a chart where the shape of the data justifies one.
5. If nothing matches with confidence, the chatbot names the closest available reports rather than guessing at an answer.
6. Every interaction is written to `ai_interactions` for observability.

### Business rules

- **No free SQL is ever generated.** The LLM selects a template and fills parameters; it never authors a query. This closes both prompt-injection and data-exfiltration as attack classes rather than trying to filter for them.
- Results respect the caller's role visibility — a Manager asking a company-wide question gets their team's numbers, not everyone's.
- No PII beyond what the question requires is sent to the model.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Question matches no template | Returns the nearest available reports by name. Does not fabricate a figure. |
| Question matches a template but the parameter is missing | Falls back to a sensible default (current year, all countries) and says so in the answer. |
| Zero rows returned | Answers "no data for that period" rather than rendering an empty chart. |
| Non-HR caller | Rejected by role middleware before any query runs. |

---

## UC-21: Audit Trail Viewer

**Primary actor:** HR Admin

### Main flow

1. HR opens **Audit trail**. Every application, approval, cancellation, delegation, and configuration change is listed newest-first.
2. Each entry records the actor's name, the timestamp, the entity and entity id, and full before/after values.
3. Filter chips narrow the view by category.
4. HR exports the filtered view.

### Business rules

- **Read-only, append-only.** There is no update or delete path in the API. Not "protected by permissions" — the endpoints do not exist.
- Config changes and leave decisions both land here, so a policy edit and the approval it later influenced are visible in one timeline.
- Retention is at least one year.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Entry created by an automated job rather than a person | `actorName` records the triggering HR user for manual runs, `System` for scheduled ones. |
| Very large before/after payloads | Stored as JSON; the viewer truncates the display and expands on click. |
| Export with a filter applied | Exports the filtered set, not the whole table — what you see is what you get. |

---

## UC-22: Reporting Suite & Exports

**Primary actor:** HR Admin / Manager

### Main flow

1. User picks one of four reports: `leave_utilisation` (approved annual days by country), `carry_forward_summary` (remaining and forfeitable days per employee), `sick_leave_trend` (MC vs no-MC), or `pending_overview` (pending counts by approval tier).
2. The report renders as a summary line, a chart, and a full data table underneath.
3. The user exports to CSV, or to a print-friendly HTML page the browser saves as PDF.

### Business rules

- Every report resolves the caller's visible user set first. HR sees everyone; a Supervisor, Manager or Boss sees their own team. The scope is applied in the query, not filtered out of the results afterwards.
- **Year handling differs by report, deliberately.** `carry_forward_summary` is balance-based, so it tracks the *active leave year* and agrees with the staff table after a year-end rollover. `leave_utilisation` and `sick_leave_trend` measure leave actually taken, so they use the real calendar year. Applying one rule to both would make one of them wrong.

### Design decision worth defending

PDF export is delivered as print-optimised HTML rather than a server-side PDF library. It adds no dependency, produces a document that matches what HR saw on screen, and the browser's own print dialog handles page breaks and margins better than a hand-rolled layout would. The trade-off is that PDF generation needs a browser, which matters for UC-30 — noted there.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Caller's team has no data in range | Empty table with an explicit "no records" line, not a broken chart. |
| Unknown report key in the URL | `400` naming the key, rather than a 500 from an undefined function. |
| CSV containing commas in names | Fields are quoted on assembly. |

---

## UC-30: Scheduled & Automated Report Delivery

**Primary actor:** HR Admin / Manager

### Main flow

1. User configures a schedule: report type, frequency (weekly / monthly / quarterly), format (CSV or PDF), and recipient list. There is no per-schedule delivery day — frequency alone drives the sweep, which keeps the scheduler a single `setInterval` rather than a calendar engine.
2. At the scheduled time the system generates the report **scoped to the schedule owner's role visibility**, and emails it to the recipient list.
3. The owner can list, pause, resume, delete, or run-now their schedules.
4. Each delivery is logged for audit.

### Business rules

- Recipients may include external addresses — payroll providers are a stated client need.
- Scope is frozen to the **owner's** visibility at generation time. A Manager's schedule cannot be escalated into a company-wide leak by adding HR to the recipient list.
- On generation failure the system retries once and notifies the owner on second failure.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Owner is deactivated after creating a schedule | Schedule stops running; it is not silently re-scoped to someone else. |
| "Run now" pressed repeatedly | Each run is a discrete audited delivery; nothing is queued twice. |
| Owner has no visible users (empty team) | Report generates with an empty table and the CSV carries the title plus `(no data)`, rather than a bare header. |

---

## UC-31: Forfeiture Risk Alert

**Primary actors:** Employee (sees own risk) · HR Admin / Manager (see the roll-up)

### Main flow — employee side

1. The employee's dashboard shows a **Forfeiture risk forecast**: a progress bar splitting days that will safely carry forward (green) from days at risk of being lost (amber).
2. The figure uses the exact rule the year-end carry-forward job uses, so the warning and the eventual outcome cannot disagree.

### Main flow — HR side

1. HR opens **Audit trail** and clicks **Send forfeiture reminders**.
2. The system checks every active employee's current annual balance against **their own country's** carry-forward cap.
3. Anyone at risk receives both an email and an in-app notification, tiered by severity:
   - **5 or more days at risk** → "Urgent"
   - **3 to 4 days** → "Important"
   - **1 to 2 days** → "Heads up"
4. Each employee's message carries their real numbers — days at risk, days available now, the cap — not a generic blast.
5. Every send is written to the audit trail.
6. AI-5 surfaces the same risk on the HR dashboard as an advisory flag.

### Business rules

- Applies only to leave types subject to expiry — annual leave in this build.
- Calculated from entitled + carried − used, against the country's configured cap.
- **No balance is ever modified.** This is a warning system. Only the carry-forward job moves days.
- Employees see only their own risk. Managers and HR see their permitted scope.
- Delivery respects each employee's notification preferences, because it reuses the shared notification pipeline rather than calling the mailer directly.

### Design decision worth defending

The reminder run is **manual, HR-triggered** rather than automatic, matching the existing carry-forward button. An automatic mailer that fires on a schedule is a mailer that fires during a live demo, or twice, or at 3am to sixty people. HR pressing a button is auditable, repeatable, and defensible.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| Employee's country has no policy row | Skipped, not defaulted — a guessed cap would produce a wrong number in a real person's inbox. |
| Employee has no annual balance row for the year | Skipped. |
| At-risk figure is zero or negative | No notification. The run reports "no one is currently at risk." |
| Employee has email notifications disabled | In-app notification only. Preference is respected. |
| Run pressed twice in a row | Sends again and audits again. Idempotency is deliberately not enforced — HR may legitimately want to re-warn. |

---

## UC-32: Long-Weekend Opportunities

**Primary actor:** Employee (HR Admin maintains the holiday calendar)

### Main flow

1. The system reads the employee's country holiday calendar, the weekend configuration, and their available balance.
2. It identifies public holidays that a small number of leave days would bridge into an extended break.
3. Each opportunity shows the proposed dates, the total days off gained, and the leave days required.
4. The employee clicks **Pre-fill** and the apply form populates instantly.
5. The employee reviews and submits. Normal approval applies.

### Business rules

- Advisory only. Submitting still goes through the full approval workflow and balance validation.
- Suggestions never include past dates.
- A suggestion that clashes with the employee's **own** approved or pending leave is hidden outright.
- A suggestion where **teammates** are already away is not hidden — it calls the real coverage-check endpoint and warns based on the actual coverage answer.

### Design decision worth defending

The first version hid any suggestion where anyone else had booked leave. That is wrong twice over: on a large team one person's leave is irrelevant, and on a small team the suggestion would vanish for everyone the moment one person acted, making the feature useless exactly when people needed it. Delegating the judgement to the existing coverage-check endpoint means the answer is the same one the approval workflow will give — one source of truth, and no second implementation of coverage logic sitting in my vertical competing with Wei Jun's.

### Edge cases handled

| Edge case | Behaviour |
|---|---|
| No upcoming holidays in range | Panel renders an empty state, not an error. |
| Insufficient balance for the bridge | Opportunity is shown with the required days stated; the apply form's own balance check is authoritative. |
| Employee's country has a non-standard weekend | Reads the per-country weekend config rather than assuming Sat/Sun. |
| Everyone has already taken the bridge days | Coverage warning is shown on the suggestion rather than removing it. |

---

## Traceability

| Use case | Primary implementation | Verified by |
|---|---|---|
| UC-10 (my half) | `server/routes/admin.js`, `server/models/LeaveType.js`, `server/routes/leaveRequest.js`, `client/src/pages/Admin.jsx` | Browser walkthrough + two-login dropdown test + `tests/nabil/leaveEligibility.test.js` |
| UC-11 / AI-4 | `server/routes/ai.js`, dashboard insight panel in `client/src/pages/Admin.jsx` | Live question answered on the dashboard |
| UC-21 | `server/routes/report.js` (`/audit`, `/audit/export`), Audit trail tab | Entries confirmed in the database after a triggered run |
| UC-22 | `server/services/reportService.js`, `server/routes/report.js` | Report run with chart and table rendered; CSV export |
| UC-11 catalogue | `server/services/queryCatalogue.js` | `tests/nabil/m5.queryCatalogue.test.js` — 82 tests total across my three suites |
| UC-30 | `server/routes/report.js` (`/schedules`) | Schedule created, toggled, run-now |
| UC-31 | `server/services/carryForwardService.js`, `server/services/emailTemplates.js`, `client/src/components/ForfeitureRiskForecast.jsx` | 10 of 10 at-risk employees emailed; 10 notifications and 10 audit rows confirmed directly in MySQL + `tests/nabil/forfeitureRisk.test.js` |
| UC-32 | `client/src/components/LongWeekendFinder.jsx` | Pre-fill clicked in a real browser, apply form populated |
