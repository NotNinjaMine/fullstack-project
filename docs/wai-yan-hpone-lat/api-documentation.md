# API Documentation — Member 3

**Author:** Wai Yan Hpone Lat  
**Base URL:** `http://localhost:3001`  
**Scope:** M3 approval, delegation, notification, comment, team-schedule, reminder, and AI-3 endpoints

## Conventions

All endpoints require the access token issued by the two-step login flow:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Dates are `YYYY-MM-DD` in Singapore business time. Typical errors are:

| Status | Meaning |
|---:|---|
| `400` | Invalid body or a business rule was not satisfied. |
| `401` | Missing, expired, or invalid authentication. |
| `403` | Authenticated, but outside the required role/team/delegation scope. |
| `404` | The requested row does not exist. |
| `409` | A concurrent/stale final decision conflicts with current state. |
| `500` | Unexpected server failure; no secret/provider detail is returned. |

Validation errors use `{ "errors": ["..."] }`; business errors normally use `{ "message": "..." }`.

## Approval queue and decisions

### `GET /leave/pending`

**Roles:** `SUPERVISOR`, `MANAGER`, `BOSS`

Returns only requests at the caller's tier that `canActOn` authorizes. Delegated rows include an `actingFor` object.

```http
GET /leave/pending
Authorization: Bearer <token>
```

```json
[
  {
    "id": 42,
    "employeeId": 7,
    "leaveType": "annual",
    "startDate": "2026-09-14",
    "endDate": "2026-09-16",
    "days": "3.0",
    "status": "PENDING_MANAGER",
    "flagged": false,
    "employee": { "id": 7, "name": "Alicia Tan", "team": "Compliance Team A" },
    "AuditLogs": []
  }
]
```

### `PUT /leave/:id/decide`

**Roles:** `SUPERVISOR`, `MANAGER`, `BOSS`

```json
{
  "approve": true,
  "acknowledgeException": false,
  "comment": "Coverage checked with the team."
}
```

Rejection example:

```json
{
  "approve": false,
  "rejectionReason": "Project handover is incomplete.",
  "comment": "Please resubmit after arranging cover."
}
```

Success:

```json
{
  "request": {
    "id": 42,
    "status": "APPROVED",
    "managerNote": null
  }
}
```

Important business errors include self-decision (`403`), wrong authority (`403`), wrong/currently changed tier (`400`), missing rejection reason (`400`), missing flagged-request acknowledgement (`400`), and a concurrent insufficient-balance outcome (`409`).

### `PUT /leave/bulk-decide`

**Roles:** `SUPERVISOR`, `MANAGER`, `BOSS`

```json
{
  "ids": [42, 43, 999],
  "approve": true,
  "comment": "Routine approvals"
}
```

```json
{
  "results": [
    { "id": 42, "ok": true, "status": "APPROVED" },
    { "id": 43, "ok": false, "message": "Coverage-flagged requests require individual Manager review." },
    { "id": 999, "ok": false, "message": "Request not found." }
  ]
}
```

The HTTP call can succeed while individual rows fail. A bulk rejection requires `rejectionReason` of at least five characters.

## Approver team schedule

### `GET /leave/team-calendar?team=<team>`

**Roles:** `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `BOSS`

The optional team must be the caller's own team or an active same-tier delegated team. Unauthorized selectors return `403`.

```json
{
  "teamName": "Compliance Team A",
  "actingFor": null,
  "availableTeams": [
    { "team": "Compliance Team A", "actingFor": null }
  ],
  "team": [
    { "id": 7, "name": "Alicia Tan", "initials": "AT" }
  ],
  "approved": [
    { "id": 35, "employeeId": 7, "startDate": "2026-09-01", "endDate": "2026-09-02" }
  ]
}
```

## Delegation

### `POST /delegation`

**Roles:** `SUPERVISOR`, `MANAGER`

```json
{
  "toUserId": 12,
  "startDate": "2026-09-01",
  "endDate": "2026-09-07",
  "reason": "Annual leave cover"
}
```

Returns the created delegation. `400` covers self-delegation, a past start, reversed dates, an inactive/missing delegate, a different role, or an overlapping active delegation involving either person.

### `GET /delegation/mine`

**Roles:** `SUPERVISOR`, `MANAGER`

```json
{
  "given": [
    {
      "id": 9,
      "startDate": "2026-09-01",
      "endDate": "2026-09-07",
      "active": true,
      "effective": true,
      "toUser": { "id": 12, "name": "Aiden Lim" }
    }
  ],
  "received": []
}
```

`effective` is computed from `active` and today's inclusive date window.

### `GET /delegation/candidates`

**Roles:** `SUPERVISOR`, `MANAGER`

Returns active users with the caller's same role, excluding the caller. Only `id`, `name`, `role`, and `team` are returned.

### `PUT /delegation/:id/revoke`

**Roles:** `SUPERVISOR`, `MANAGER`

Only the original delegator can revoke. Success:

```json
{ "message": "Delegation revoked." }
```

Errors: `404` missing delegation, `403` not the owner, `400` already inactive.

## Comment thread

### `GET /leave/:id/comments`

Returns chronological comments for an authorized participant. The request owner, original tiers, valid delegates, and HR Admin may read. Other users receive `403`.

```json
[
  {
    "id": 18,
    "requestId": 42,
    "authorId": 7,
    "authorName": "Alicia Tan",
    "authorRole": "EMPLOYEE",
    "body": "I have completed the handover.",
    "createdAt": "2026-08-09T10:00:00.000Z"
  }
]
```

### `POST /leave/:id/comments`

```json
{ "body": "Coverage is arranged with Kai." }
```

Returns the new comment. The body must contain 1–500 characters. `400` is returned after a terminal decision because the thread is locked. HR Admin is audit-read-only and receives `403` when posting.

## Notifications and reminders

### `GET /notification?unread=true`

Returns the caller's newest-first notification list. Omit `unread=true` to include read rows.

### `GET /notification/unread-count`

```json
{ "count": 3 }
```

### `PUT /notification/:id/read`

```json
{ "message": "Marked read." }
```

Returns `403` if the notification belongs to another account.

### `PUT /notification/read-all`

```json
{ "message": "All notifications marked read.", "updated": 3 }
```

### `POST /notification/run-reminders`

**Roles:** `MANAGER`, `HR_ADMIN`, `BOSS`

Manual/demo trigger for the same stage-aware reminder sweep used by the scheduler.

```json
{ "remindersSent": 2 }
```

## AI-3 endpoints

All AI responses are advisory. They cannot change request status or balance.

### `GET /ai/summary/:requestId`

**Roles:** `SUPERVISOR`, `MANAGER`, `HR_ADMIN`, `BOSS` with request-level authorization

```json
{
  "employee": { "id": 7, "name": "Alicia Tan", "initials": "AT" },
  "teamSize": 5,
  "minPresent": 2,
  "patterns": ["4 day(s) taken YTD - 2 request(s) in 12 months - 0 rejected."],
  "coveragePerDay": [
    { "date": "2026-09-14", "present": 3, "offNames": ["Kai Ong"] }
  ],
  "conflicts": [],
  "noticeDays": 30,
  "recommendation": {
    "action": "APPROVE",
    "label": "Approve",
    "rationale": "No teammate overlap on any requested day..."
  }
}
```

### `GET /ai/coverage-brief`

**Roles:** `SUPERVISOR`, `MANAGER`, `BOSS`

Summarizes the caller's tier-scoped pending queue and returns `queueSize`, `tier`, `team`, and `advisoryOnly: true` along with the generated/fallback brief.

### `POST /ai/draft-note`

**Roles:** `SUPERVISOR`, `MANAGER`, `BOSS`

```json
{ "requestId": 42, "mode": "reject" }
```

Returns an advisory note draft with `advisoryOnly: true`. The caller must be authorized for that request.

### `POST /ai/explain-status`

```json
{ "requestId": 42 }
```

Available to the authorized approval chain and, where allowed by the route, the request owner or HR viewer. Returns the current status, waiting hours, explanation, and `advisoryOnly: true`.

## Example curl sequence

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/leave/pending

curl -X PUT http://localhost:3001/leave/42/decide \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approve":true,"acknowledgeException":false,"comment":"Coverage checked."}'
```

Use a real access token from the two-step login flow; the server intentionally provides no test-only authentication bypass.
