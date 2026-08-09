# API Documentation — Member 4 (Coverage, Calendar & Scheduling Rules)

**Author:** Wei Jun · Member 4
**Scope:** the endpoints I own — `/coverage/*` and `/holiday/*`. Two endpoints my
engine powers but that live in M2's route file (`POST /leave/coverage-check`,
`GET /leave/team-calendar`) are documented at the end for completeness, with a
note on where the actual logic lives.

**Base URL:** `http://localhost:3001` in development.

---

## Conventions

### Authentication

Every endpoint below requires a bearer token issued by M1's sign-in flow:

```
Authorization: Bearer <accessToken>
```

### Role guard

`requireRole(...)` is enforced server-side. Configuration writes (weekend config,
blackout periods, holiday import) are restricted to `HR_ADMIN` (and, for blackout
periods, `MANAGER`/`BOSS` as well, since a team-scoped blackout is something a
Manager should be able to declare without going through HR). Reads are open to
any authenticated user, because employees need this data to understand their own
calendar — a blackout or holiday that only admins could see would defeat the
point of showing it.

### Error shape

| Situation | Status | Body |
|---|---|---|
| Business-rule failure | `400` | `{ "message": "human-readable reason" }` |
| Schema validation failure (yup) | `400` | `{ "errors": ["field is a required field"] }` |
| Not signed in / bad token | `401` | *(empty)* |
| Signed in but not permitted | `403` | *(empty)* or `{ "message": "..." }` |
| Row does not exist | `404` | *(empty)* |

### Dates

All dates are `YYYY-MM-DD` strings, consistent with the rest of the project.

---

## 1. Shared dropdown options

### `GET /coverage/options`

The closed lists every coverage and onboarding form uses — countries come from
the configured leave policies (M5's `LeavePolicy` table), teams from
`config/teams.js`. Any authenticated user may read this: employees need it to
label a blackout period, HR needs it to create one.

**Roles:** any authenticated user

**Success — `200 OK`**

```json
{
  "countries": [
    { "country": "SG", "countryName": "Singapore", "annualMin": 14, "annualMax": 24 },
    { "country": "TH", "countryName": "Thailand", "annualMin": 8, "annualMax": 11 }
  ],
  "teams": ["Compliance Team A", "Compliance Team B"]
}
```

---

## 2. Country weekend configuration — UC-29

### `GET /coverage/weekend-config`

Lists every configured country's working-day map, filling in the Sat/Sun default
for any country that has no explicit row — the admin screen never shows a blank
entry.

**Roles:** any authenticated user

**Success — `200 OK`**

```json
[
  {
    "country": "SG",
    "countryName": "Singapore",
    "workingDays": { "mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false }
  },
  {
    "country": "TH",
    "countryName": "Thailand",
    "workingDays": { "mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false }
  }
]
```

Every seeded country currently uses the Sat/Sun default — no country in this
deployment has been given a non-default weekend yet. The example below shows what
a `PUT` for a Friday/Saturday weekend (e.g. as used in several Gulf countries)
*would* look like; it is a hypothetical to illustrate the mechanism, not a
configured row in this system.

### `PUT /coverage/weekend-config`

Sets a country's weekend configuration. Every request is audited with a
before/after snapshot.

**Roles:** `HR_ADMIN`

**Request** — illustrative only; none of the 10 seeded countries currently uses a
non-default weekend, so this shows the payload shape rather than a real
configured value:

```json
{
  "country": "AE",
  "workingDays": { "mon": true, "tue": true, "wed": true, "thu": true, "fri": false, "sat": false, "sun": true }
}
```

| Field | Type | Notes |
|---|---|---|
| `country` | string, required | Exactly 2 letters; normalised to uppercase |
| `workingDays` | object, required | All seven weekday keys (`mon`…`sun`) required as booleans — no partial updates |

**Success — `200 OK`** — the saved row, including its `id`.

**Errors**

| Status | When | Body |
|---|---|---|
| `400` | A weekday key is missing, or every day is `false` | `{ "message": "At least one working day per week is required." }` or `{ "errors": [...] }` from yup |
| `403` | Caller is not `HR_ADMIN` | *(empty)* |

**Side effects:** writes a `ConfigAuditLog` row (`entity: "country_working_days"`)
recording the previous map (or the Sat/Sun default if this is the country's first
configuration) against the new one.

---

## 3. Blackout / restricted leave periods — UC-18

### `GET /coverage/blackouts`

**Roles:** any authenticated user (see query params for scope)

| Query param | Effect |
|---|---|
| *(none)* | Active `COUNTRY` periods for the caller's own country, plus active `TEAM` periods for their own team — what their calendar should render |
| `all=1` | Every active period, country- and team-scoped. Silently ignored unless the caller is `HR_ADMIN` or `MANAGER` |
| `country=`, `team=` | Explicit override, for an approver checking a scope other than their own |

**Success — `200 OK`**

```json
[
  {
    "id": 4,
    "scope": "COUNTRY",
    "scopeId": "SG",
    "startDate": "2026-12-28",
    "endDate": "2027-01-02",
    "mode": "BLOCK",
    "reason": "Year-end financial close",
    "active": true
  }
]
```

### `POST /coverage/blackouts`

Creates a blackout period.

**Roles:** `HR_ADMIN`, `MANAGER`, `BOSS`

**Request**

```json
{
  "scope": "TEAM",
  "scopeId": "Compliance Team A",
  "startDate": "2026-09-01",
  "endDate": "2026-09-05",
  "mode": "SPECIAL_APPROVAL",
  "reason": "Client audit week"
}
```

| Field | Type | Notes |
|---|---|---|
| `scope` | `"COUNTRY"` \| `"TEAM"`, required | |
| `scopeId` | string, required | Must be a country with a configured leave policy, or a team from `config/teams.js` — validated, not free text |
| `startDate` / `endDate` | `YYYY-MM-DD`, required | End must be on or after start |
| `mode` | `"BLOCK"` \| `"SPECIAL_APPROVAL"`, optional | Defaults to `SPECIAL_APPROVAL` |
| `reason` | string, optional, max 200 chars | |

**Success — `200 OK`** — the created row.

**Errors**

| Status | When | Body |
|---|---|---|
| `400` | `endDate` before `startDate` | `{ "message": "endDate must be on or after startDate." }` |
| `400` | `scope: "COUNTRY"` names a country with no leave policy | `{ "message": "<CODE> is not a configured country. Pick one from the country list." }` |
| `400` | `scope: "TEAM"` names an unrecognised team | `{ "message": "Unknown team. Pick one of: <list>." }` |
| `400` | Missing/malformed fields | `{ "errors": [...] }` from yup |
| `403` | Caller is not HR_ADMIN/MANAGER/BOSS | *(empty)* |

**Side effects:** writes a `ConfigAuditLog` row (`entity: "blackout_periods"`) with
the created period as the "after" value and `null` as "before".

### `PUT /coverage/blackouts/:id/deactivate`

Deactivates a blackout period rather than deleting it, preserving history.

**Roles:** `HR_ADMIN`, `MANAGER`, `BOSS`

**Success — `200 OK`**

```json
{ "message": "Blackout period deactivated." }
```

**Errors**

| Status | When |
|---|---|
| `404` | No period with that id |
| `403` | Caller is not HR_ADMIN/MANAGER/BOSS |

**Side effects:** writes a `ConfigAuditLog` row recording `active: true → false`.

---

## 4. Public holidays — UC-06

### `GET /holiday`

**Roles:** any authenticated user

| Query param | Effect |
|---|---|
| *(none)* | The caller's own country's holidays |
| `country=` | An explicit country (any authenticated user may check another country's calendar — this is public reference data, not sensitive) |

**Success — `200 OK`**

```json
[
  { "id": 12, "country": "SG", "date": "2026-08-09", "name": "National Day" },
  { "id": 13, "country": "SG", "date": "2027-01-01", "name": "New Year's Day" }
]
```

Sorted by date ascending. Returns an empty array for a country with no configured
holidays, not an error.

### `POST /holiday/import`

Bulk-adds holiday dates for a country. This is the only import path that exists —
there is no CSV upload or online calendar feed; the 2026 baseline data is seeded
directly from `data/holidays2026.js` at startup, and this endpoint is for adding
to it afterwards.

**Roles:** `HR_ADMIN`, `MANAGER`, `BOSS`

**Request**

```json
{
  "country": "SG",
  "holidays": [
    { "date": "2027-01-01", "name": "New Year's Day" },
    { "date": "2027-02-17", "name": "Chinese New Year" }
  ]
}
```

**Success — `200 OK`**

```json
{ "message": "2 holiday(s) imported for SG." }
```

**Errors**

| Status | When | Body |
|---|---|---|
| `400` | Missing/malformed fields, or an empty `holidays` array | `{ "errors": [...] }` |

**Note:** no duplicate check against existing rows for the same country/date. A
holiday imported twice creates two rows; since day-counting only asks "is this
date a holiday" (a set membership test), a duplicate row does not double-exclude a
day, but it is untidy data worth a follow-up guard.

---

## 5. Endpoints I power but do not own the route file for

These live in `routes/leaveRequest.js` (M2's file) because they serve the leave
application form directly, but the logic is entirely mine (`services/coverage.js`).
Documented here so the engine's actual API surface is in one place; the request
lifecycle around them (drafts, submission, notifications) is M2's to document.

### `POST /leave/coverage-check` — UC-07, AI-2

Pre-submission "would this leave the team short" check. Advisory only — the
authoritative check runs again server-side inside `POST /leave/apply` itself.

**Roles:** `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `HR_ADMIN`, `BOSS`

**Request**

```json
{ "startDate": "2026-08-10", "endDate": "2026-08-14" }
```

**Success — `200 OK`**

```json
{
  "workDays": ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
  "days": 5,
  "teamSize": 5,
  "minPresent": 3,
  "conflicts": [
    {
      "date": "2026-08-11",
      "present": 2,
      "offUserIds": [7, 9],
      "offNames": ["Priya", "Marcus"],
      "explanation": "Only 2 of 5 present on 2026-08-11 (also away: Priya, Marcus)."
    }
  ],
  "alternative": { "start": "2026-08-17", "end": "2026-08-21" }
}
```

`conflicts` is `[]` and `alternative` is `null` when the range has no coverage
issue. `alternative` is also `null` when 90 days of forward-probing finds no
fully-clear window of the same length.

### `GET /leave/team-calendar`

Powers M2's team calendar view and the coverage check's "who else is off" data.
Respects delegated acting-approver scope (M3): a Supervisor or Manager covering
for a colleague sees that team too, listed in `availableTeams`.

**Roles:** `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `BOSS`

| Query param | Effect |
|---|---|
| *(none)* | The caller's own team |
| `team=` | An explicit team, only if the caller is authorised to view it (own team, or delegated-to) |

**Success — `200 OK`**

```json
{
  "teamName": "Compliance Team A",
  "actingFor": null,
  "availableTeams": [{ "team": "Compliance Team A", "actingFor": null }],
  "team": [{ "id": 3, "name": "Priya Nair", "initials": "PN" }],
  "approved": [{ "userId": 3, "startDate": "2026-08-11", "endDate": "2026-08-12" }]
}
```

**Errors**

| Status | When |
|---|---|
| `403` | `team=` names a team the caller is not authorised to view |
