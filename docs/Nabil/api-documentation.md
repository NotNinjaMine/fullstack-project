# API Documentation — Member 5 (Nabil)

**Author:** Nabil Hady · Member 5 — HR Admin, Analytics & Automation
**Base URL (local):** `http://localhost:3001`
**Verified against:** `server/routes/admin.js`, `server/routes/report.js`, `server/routes/ai.js`, `server/routes/leaveRequest.js`

> Routers mount at the root, not under `/api`. Admin at `/admin`, reporting at `/report`, AI at `/ai`, leave at `/leave`.

This document covers the endpoints my use cases own. Endpoints belonging to other verticals (auth, sessions, approvals, delegation, coverage, holidays) are documented by their owners.

---

## Authentication and roles

Every endpoint requires a bearer token issued at login.

```
Authorization: Bearer <jwt>
```

| Middleware | Effect |
|---|---|
| `validateToken` | Rejects a missing, malformed or expired token with `401`. Attaches `req.user` — `id`, `name`, `email`, `role`, `country`, `gender`, `team`. |
| `requireRole(...)` | Rejects any role not in the allow-list with `403`, **before the handler runs**, so a disallowed caller never reaches a query. |

**Roles as built:** `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `HR_ADMIN`, `BOSS`. The `BOSS` tier decides a Manager's own leave, since no team peer could without a conflict of interest. `HOD` appears in some `requireRole` lists as a retained enum value from the original five-role design; no `HOD` accounts are created.

### Standard error shapes

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "message": "..." }` | Business-rule rejection with a human-readable reason |
| `400` | `{ "errors": ["...", "..."] }` | Yup validation failure. All failures returned at once (`abortEarly: false`) |
| `401` | — | Missing or invalid token |
| `403` | — | Authenticated, wrong role or not the owner |
| `404` | — | Entity does not exist |
| `409` | `{ "message": "..." }` | Conflicting concurrent write |

---

## UC-10 — Leave-type catalogue

### `GET /admin/leave-types`

Full catalogue, including inactive types, ordered by code. **HR_ADMIN only.**

**Response `200`** — array of raw `LeaveType` rows:

```json
[
  {
    "id": 1,
    "code": "annual",
    "name": "Annual Leave",
    "affectsAnnualBalance": true,
    "affectsSickBalance": false,
    "requiresMc": false,
    "active": true,
    "applicableCountries": null,
    "genderRestriction": "ANY",
    "createdAt": "2026-07-02T04:11:09.000Z",
    "updatedAt": "2026-08-08T11:22:41.000Z"
  },
  {
    "id": 6,
    "code": "maternity",
    "name": "Maternity Leave",
    "affectsAnnualBalance": false,
    "affectsSickBalance": false,
    "requiresMc": false,
    "active": true,
    "applicableCountries": ["SG"],
    "genderRestriction": "FEMALE"
  }
]
```

`applicableCountries: null` means every country. It is stored as `NULL` rather than `[]` so rows seeded before the column existed behave identically, and so clearing every country chip in the HR panel cannot read as "offered nowhere".

---

### `PUT /admin/leave-types/:code`

Create or update a leave type. **HR_ADMIN only.** Uses `findOrCreate`, so saving an unknown code **creates** it — HR adds a leave type without a migration or a code change.

**Path parameter:** `code` — lowercased on write.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | **yes** | Trimmed, max 50 |
| `affectsAnnualBalance` | boolean | no | Default `false` |
| `affectsSickBalance` | boolean | no | Default `false` |
| `requiresMc` | boolean | no | Default `false` |
| `active` | boolean | no | Default `true` |
| `applicableCountries` | string[] | no | Each entry exactly 2 chars, uppercased. Omitted or `[]` → stored as `NULL` = every country |
| `genderRestriction` | string | no | `ANY` \| `MALE` \| `FEMALE`. Default `ANY` |

```bash
curl -X PUT http://localhost:3001/admin/leave-types/maternity \
  -H "Authorization: Bearer $HR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Maternity Leave","applicableCountries":["SG"],"genderRestriction":"FEMALE"}'
```

**Response `200`** — the saved row. A `config_audit_log` entry is written with full before/after as a side effect.

| Status | Example body | Cause |
|---|---|---|
| `400` | `{"errors":["name is a required field"]}` | Missing field |
| `400` | `{"errors":["applicableCountries[0] must be exactly 2 characters"]}` | Bad country code |
| `403` | — | Caller is not HR_ADMIN |

---

### `GET /leave/types`

The types **the calling employee may actually apply for**. Any authenticated user — read-only and scoped to the caller's own profile, so restricting it to HR would break the apply form for everyone.

Filtering, in order: `active` is true → country list is empty/null or contains the caller's country → restriction is `ANY` or equals the caller's gender.

**Response `200`** — a trimmed projection, not the full row:

```json
[
  { "code": "annual", "name": "Annual Leave", "requiresMc": false,
    "affectsAnnualBalance": true, "affectsSickBalance": false },
  { "code": "maternity", "name": "Maternity Leave", "requiresMc": false,
    "affectsAnnualBalance": false, "affectsSickBalance": false }
]
```

**Worked example.** Two Singapore employees, same endpoint:

| Caller | `maternity` (SG, FEMALE) | `ns_reservist` (SG, MALE) |
|---|---|---|
| female, SG | yes | no |
| male, SG | no | yes |
| female, MY | no | no |

This handler and every write path below call `checkLeaveTypeEligibility` in `server/services/leaveEligibility.js`, so the dropdown can never offer a type the server would then reject.

---

### Eligibility enforcement on write paths

The filtered dropdown is convenience, not security. The same rule runs server-side on all three write paths:

| Endpoint | When checked |
|---|---|
| `POST /leave/apply` | Before date or balance validation |
| `PUT /leave/drafts/:id` | Only when `leaveType` is being changed |
| `POST /leave/drafts/:id/submit` | **Re-checked** — the catalogue may have changed while the draft sat unsubmitted |

**Rejections, all `400`:**

```json
{ "message": "This leave type is not available." }
{ "message": "Maternity Leave is not available in your country." }
{ "message": "Maternity Leave is not available for your profile." }
```

Distinct so the employee learns whether the problem is a retired type, their country, or their profile — without the message publishing the rule's configuration.

---

## UC-10 — Country policy

### `GET /admin/policies`

All ten country policy rows, ordered by country name. **HR_ADMIN only.**

```json
[
  { "id": 1, "country": "SG", "countryName": "Singapore",
    "annualMin": 14, "annualMax": 24, "sickMc": 12, "sickNoMc": 2,
    "carryForwardMax": 5 }
]
```

### `PUT /admin/policies/:country`

Update one country's policy. **HR_ADMIN only.** Path parameter is uppercased. Audited with before/after.

| Field | Type | Required | Range |
|---|---|---|---|
| `annualMin` | integer | **yes** | 0–60 |
| `annualMax` | integer | **yes** | 0–60, and ≥ `annualMin` |
| `sickMc` | integer | **yes** | 0–90 |
| `sickNoMc` | integer | **yes** | 0–30 |
| `carryForwardMax` | integer | **yes** | 0–30 |

Every field is required — this is a full replace, not a patch. `annualMax < annualMin` returns `400 {"message":"annualMax must be >= annualMin."}`; an unknown country returns `404`.

**`carryForwardMax` is read in four places:** the year-end carry-forward job, the forfeiture reminder service, the carry-forward summary report, and the AI-5 forfeiture flag. One number in one row, not four constants free to drift.

---

## UC-31 — Forfeiture reminders

### `POST /admin/forfeiture-reminders/trigger`

Emails and in-app-notifies every active employee currently at risk of losing annual leave at year-end. **HR_ADMIN only.**

**Modifies no balance.** Only `POST /admin/carry-forward/trigger` moves days.

| Field | Type | Required | Rules |
|---|---|---|---|
| `year` | integer | no | 2000–2100, defaults to the current calendar year |

```bash
curl -X POST http://localhost:3001/admin/forfeiture-reminders/trigger \
  -H "Authorization: Bearer $HR_TOKEN" -H "Content-Type: application/json" -d '{}'
```

**Response `200` — employees at risk**

```json
{
  "message": "10 of 10 employee(s) at risk — 10 email(s) sent (7 urgent, 2 important, 1 heads-up).",
  "checked": 10, "atRisk": 10, "emailed": 10,
  "byTier": { "critical": 7, "warning": 2, "notice": 1 }
}
```

**Response `200` — nobody at risk**

```json
{
  "message": "Checked 10 employee(s) — no one is currently at risk of forfeiture.",
  "checked": 10, "atRisk": 0, "emailed": 0,
  "byTier": { "critical": 0, "warning": 0, "notice": 0 }
}
```

**Severity tiers** — days at risk is `max(0, entitled + carried − used − carryForwardMax)`:

| Days at risk | Tier | Email subject |
|---|---|---|
| ≥ 5 | `critical` | Urgent: annual leave at risk of forfeiture |
| 3–4.99 | `warning` | Important: annual leave at risk of forfeiture |
| 1–2.99 | `notice` | Heads up: annual leave at risk of forfeiture |
| < 1 | — | Nothing sent |

**Per-employee side effects:** one email through the shared `notify()` pipeline (so the employee's own preference is respected without this endpoint knowing anything about preferences), one in-app notification, and one `config_audit_log` entry reading `Forfeiture reminder sent to <name>: <n>d at risk (<tier>)`.

**Skipped silently:** employees whose country has no policy row, and employees with no annual balance for the requested year. A guessed cap puts a wrong number in a real person's inbox.

---

## UC-21 — Audit trail

### `GET /report/audit`

Merged view of `audit_logs` (leave decisions) and `config_audit_log` (configuration changes), newest first. **HR_ADMIN only.**

| Query parameter | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | Case-insensitive `LIKE` across `action` and `actorName` |
| `limit` | integer | 200 | Capped at 500 |

**Response `200`** — a flat array, not a paged envelope:

```json
[
  { "id": "C214", "source": "config",
    "action": "Forfeiture reminder sent to Wei Ling: 7d at risk (critical)",
    "actorName": "HR Admin", "entity": "leave_balances", "entityId": "4",
    "createdAt": "2026-08-08T11:47:02.000Z" },
  { "id": "L188", "source": "leave",
    "action": "Approved by Marcus Tan", "actorName": "Marcus Tan",
    "entity": "leave_requests", "entityId": "42",
    "createdAt": "2026-08-08T11:31:55.000Z" }
]
```

Ids are prefixed `L` or `C` because the two source tables have independent auto-increments — a bare integer id would collide across sources. `before`/`after` are stored on the row but **not returned by this endpoint**; the list view shows the action text.

**The limit applies per source before merging.** With `limit=200` the query takes up to 200 from each table and returns the newest 200 of the combined 400, so the result is correct at the head of the list. A very old entry could be missed if one source dominates; the search parameter is the intended way to reach those.

### `GET /report/audit/export`

Same `q` filter, up to 1000 rows per source, returned as CSV.

```
Content-Type: text/csv
Content-Disposition: attachment; filename="audit-trail.csv"
```

Columns: `time,source,actor,action`. Fields containing a comma, quote or newline are quoted and inner quotes doubled.

**There is no `POST`, `PUT` or `DELETE` on the audit trail.** The endpoints do not exist — immutability is structural, not a permission that could be misconfigured.

---

## UC-22 — Reporting suite

### `GET /report/run/:type`

Run a report. Roles: `SUPERVISOR`, `MANAGER`, `HOD`, `HR_ADMIN`, `BOSS`. Scope resolves from the caller — HR_ADMIN sees every user, everyone else sees their own team.

**Path parameter `type`** — exactly these four keys:

| Key | Report |
|---|---|
| `leave_utilisation` | Approved annual days this year, grouped by country |
| `carry_forward_summary` | Remaining and forfeitable days per employee |
| `sick_leave_trend` | Approved sick days split by with-MC and without-MC |
| `pending_overview` | Pending request counts by approval tier |

An unknown key returns `400 {"message":"Unknown report type \"x\"."}`.

**Response `200`** — every report returns the same envelope:

```json
{
  "title": "Leave utilisation by country (2026)",
  "chart": { "type": "bar", "x": ["SG", "MY"], "y": [128, 46] },
  "table": [
    { "country": "SG", "countryName": "Singapore", "days": 128 },
    { "country": "MY", "countryName": "Malaysia", "days": 46 }
  ]
}
```

Table columns differ per report — `carry_forward_summary` returns `{ userId, name, remaining, willForfeit }`, `pending_overview` returns `{ tier, count }`.

**Year handling differs by report, deliberately.** `carry_forward_summary` is balance-based, so it tracks the **active leave year** and agrees with the staff table after a year-end rollover. `leave_utilisation` and `sick_leave_trend` measure leave actually taken, so they use the real calendar year.

**Scope is applied inside the query**, not by filtering results afterwards — a Manager's request never loads another team's rows into memory.

### `GET /report/export/:type`

Same reports and scoping, returned as CSV: the report title on line 1, then a header row derived from the first table row, then the data. Filename is `<type>.csv`. An empty report exports the title and `(no data)` rather than a bare header.

---

## UC-30 — Scheduled report delivery

Roles for all five endpoints: `MANAGER`, `HOD`, `HR_ADMIN`, `BOSS`. Every one is **owner-scoped** — a non-owner gets `403`, including HR_ADMIN.

### `GET /report/schedules`

The caller's own schedules, newest first.

```json
[
  { "id": 3, "ownerUserId": 2, "ownerName": "HR Admin",
    "reportType": "leave_utilisation", "frequency": "monthly",
    "format": "CSV", "recipients": ["payroll@vendor.example"],
    "active": true, "lastRunAt": "2026-08-01T01:00:00.000Z" }
]
```

### `POST /report/schedules`

| Field | Type | Required | Rules |
|---|---|---|---|
| `reportType` | string | **yes** | One of the four report keys |
| `frequency` | string | no | `weekly` \| `monthly` \| `quarterly` (lowercase). Default `monthly` |
| `format` | string | no | `CSV` \| `PDF` (uppercase). Default `CSV` |
| `recipients` | string[] | **yes** | At least one valid email. External addresses permitted |

There is no `deliveryDay` field — frequency alone determines the run. Owner is taken from the token, never from the body.

**Response `200`** — the created row.

### `PUT /report/schedules/:id/toggle`

Flips `active`. Returns `{ "message": "Schedule paused.", "active": false }`.

### `DELETE /report/schedules/:id`

Returns `{ "message": "Schedule deleted." }`.

### `POST /report/schedules/:id/run-now`

Generates and delivers immediately, then stamps `lastRunAt`. Returns `{ "message": "Report delivered to 2 recipient(s).", ... }`.

**Scope note.** Reports generate against the **owner's** visibility, never the recipient's. Adding an HR address to a Manager's schedule does not escalate what the report contains.

---

## UC-11 / AI-4 — HR insights chatbot

### `POST /ai/insights`

Natural-language HR question. Roles: `HR_ADMIN`, `MANAGER`, `HOD`, `SUPERVISOR`, `BOSS` — each scoped to what they may see.

| Field | Type | Required | Rules |
|---|---|---|---|
| `question` | string | **yes** | Trimmed, 2–300 chars |

**Response `200` — template matched**

```json
{
  "matchedTemplate": "leave_usage_by_country",
  "source": "offline",
  "answer": "Singapore has the highest annual-leave usage at 128 day(s), ahead of Malaysia (46).",
  "chart": { "type": "bar", "x": ["SG", "MY"], "y": [128, 46] },
  "table": [ { "country": "SG", "countryName": "Singapore", "days": 128 } ],
  "advisoryOnly": true
}
```

**Response `200` — nothing matched**

```json
{
  "matchedTemplate": null,
  "source": "offline",
  "answer": "I don't have a matching report for that. Try asking about leave usage by country, unused/forfeiture balances, sick-leave trend, pending requests, or risk flags.",
  "suggestions": [ { "key": "leave_usage_by_country", "description": "Leave usage / utilisation grouped by country" } ],
  "advisoryOnly": true
}
```

**The fixed query catalogue** — the model picks one of these keys and nothing else:

| Key | Answers |
|---|---|
| `leave_usage_by_country` | Utilisation grouped by country |
| `unused_balance_by_employee` | Who risks forfeiting leave |
| `sick_leave_trend` | Sick leave, MC vs no-MC |
| `pending_overview` | How many requests are pending, by tier |
| `anomaly_flags` | Risk flags — forfeiture, burnout, clustering, coverage |

**The LLM never generates SQL.** It receives the key list and returns `{"key": "..."}` or `{"key": null}`; the backend runs a pre-defined function. Classification is keyword-scored offline by default and refined by the LLM only when a key is configured; `source` tells you which path ran. Any LLM error falls back to the offline result silently — `llmError` is stripped before the response is sent, so a degraded classifier never leaks a provider error to the client. Every call is logged to `ai_interactions`.

This design removes prompt injection and data exfiltration as attack classes rather than filtering for them.

---

## AI-5 — Anomaly and risk flags

### `GET /ai/anomalies`

Rule-based advisory flags for the HR dashboard. **HR_ADMIN only.** No LLM call at all — fully offline, so the demo is deterministic.

**Response `200`**

```json
{
  "generatedAt": "2026-08-09T04:22:10.412Z",
  "count": 9,
  "advisoryOnly": true,
  "flags": [
    { "severity": "warning", "category": "Forfeiture risk",
      "message": "Wei Ling has 12 annual day(s) left — about 7 may be forfeited at year-end (5-day cap).",
      "userId": 4 },
    { "severity": "info", "category": "Low utilisation",
      "message": "Kumar has taken 0 day(s) so far — consider encouraging a break (burnout signal).",
      "userId": 7 },
    { "severity": "warning", "category": "Request clustering",
      "message": "4 requests cluster on 2026-12-24 — check team coverage for that day.",
      "date": "2026-12-24" }
  ]
}
```

| Category | Rule | Severity |
|---|---|---|
| Forfeiture risk | At-risk days ≥ 3, using the employee's **own country cap** | `warning` |
| Low utilisation | 1 day or fewer used with entitlement ≥ 10 | `info` |
| Request clustering | 3 or more requests starting on the same date | `warning` |
| Coverage gap | Pending requests already flagged for special approval | `warning` |

Balances are read for the **active leave year**, not the calendar year, so the panel agrees with the staff table after a rollover.

**Flags are advisory prompts, never automated actions.** Nothing here writes to a balance or decides a request — `advisoryOnly: true` is returned explicitly so a future UI cannot mistake it.

---

## Endpoint index

| Method | Path | Roles | Use case |
|---|---|---|---|
| `GET` | `/admin/leave-types` | HR_ADMIN | UC-10 |
| `PUT` | `/admin/leave-types/:code` | HR_ADMIN | UC-10 |
| `GET` | `/leave/types` | Any authenticated | UC-10 |
| `GET` | `/admin/policies` | HR_ADMIN | UC-10 |
| `PUT` | `/admin/policies/:country` | HR_ADMIN | UC-10 |
| `GET` | `/admin/dashboard` | HR_ADMIN | UC-10 |
| `POST` | `/admin/forfeiture-reminders/trigger` | HR_ADMIN | UC-31 |
| `GET` | `/report/audit` | HR_ADMIN | UC-21 |
| `GET` | `/report/audit/export` | HR_ADMIN | UC-21 |
| `GET` | `/report/run/:type` | SUPERVISOR, MANAGER, HOD, HR_ADMIN, BOSS | UC-22 |
| `GET` | `/report/export/:type` | SUPERVISOR, MANAGER, HOD, HR_ADMIN, BOSS | UC-22 |
| `GET` | `/report/schedules` | MANAGER, HOD, HR_ADMIN, BOSS (owner) | UC-30 |
| `POST` | `/report/schedules` | MANAGER, HOD, HR_ADMIN, BOSS | UC-30 |
| `PUT` | `/report/schedules/:id/toggle` | Owner | UC-30 |
| `DELETE` | `/report/schedules/:id` | Owner | UC-30 |
| `POST` | `/report/schedules/:id/run-now` | Owner | UC-30 |
| `POST` | `/ai/insights` | HR_ADMIN, MANAGER, HOD, SUPERVISOR, BOSS | UC-11 / AI-4 |
| `GET` | `/ai/anomalies` | HR_ADMIN | AI-5 |
