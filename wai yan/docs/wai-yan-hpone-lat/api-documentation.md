# API Documentation — Wai Yan Hpone Lat (Member 3)

**Base URL:** `/api`  
**Auth:** `Authorization: Bearer <JWT>` (except login)  

## Response envelope

**Success**
```json
{ "success": true, "data": { } }
```

**Error**
```json
{ "success": false, "code": "ERROR_CODE", "message": "Human readable" }
```

CSV exports return raw `text/csv` (not JSON envelope).

---

## Auth

### POST /api/auth/login
Public.

```json
{ "email": "alice.tan@company.com", "password": "Password123!" }
```

**200**
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": 5, "name": "Alice Tan", "role": "employee", "..." : "..." }
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`

### GET /api/auth/me
Authenticated profile.

**Errors:** `401 UNAUTHORISED`

---

## Leave (supporting workflow)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/leave` | Own list (`status`, `year`, `leave_type`) |
| POST | `/api/leave` | Create → `pending`, audit, notify supervisor |
| GET | `/api/leave/:id` | Owner / reporting line / HR |
| POST | `/api/leave/:id/cancel` | Owner or HR |
| GET | `/api/leave/overlap` | `start_date` + `end_date` required |

**POST create 201 data:** `{ id, status, overlap_flag, special_approval_flag, days_count }`

**Cancel:** pending → `cancelled`; approved/supervisor_approved → `cancel_pending`

**Errors:** `INSUFFICIENT_BALANCE`, `INVALID_DATE_RANGE`, `ALREADY_CANCELLED`, `FORBIDDEN`, `NOT_FOUND`

---

## Approvals (UC-02, 08, 15, 16)

### GET /api/approvals
Roles: supervisor, manager, hr_admin, acting delegate.

**Item shape (excerpt)**
```json
{
  "id": 42,
  "applicant": { "id": 1, "name": "Alice Tan", "department": "Finance", "country_code": "SG" },
  "leave_type": "annual",
  "start_date": "2026-11-09",
  "end_date": "2026-11-11",
  "days_count": 3,
  "status": "pending",
  "awaiting_role": "supervisor",
  "team_on_leave_count": 1,
  "overlap_flag": false,
  "special_approval_flag": false,
  "ai_summary": {
    "risk_level": "low",
    "bullets": ["..."],
    "recommendation": "...",
    "decision_required": true,
    "generated_by": "rule_engine_v1"
  }
}
```

### PUT /api/approvals/:id/approve
```json
{ "note": "Coverage OK" }
```

Supervisor → `{ status: "supervisor_approved", ... }`  
Manager → `{ status: "approved", balance_deducted: 3 }`

### PUT /api/approvals/:id/reject
```json
{ "note": "Insufficient coverage" }
```
Note **required**.

**Errors:** `ALREADY_ACTIONED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`

### GET /api/approvals/calendar?start_date=&end_date=
UC-08 team leave events (role-scoped).

### GET /api/approvals/history?year=&status=
UC-08 history of actioned leave.

### POST /api/approvals/bulk
```json
{ "action": "approve", "ids": [1,2,3], "note": "Batch OK" }
```
Returns per-id success/failure.

### GET/POST /api/approvals/delegations · DELETE /api/approvals/delegations/:id
UC-15 acting approver.

---

## Notifications (UC-12)

| Method | Path |
|--------|------|
| GET | `/api/notifications` (`?unread=true`) |
| PUT | `/api/notifications/:id/read` |
| PUT | `/api/notifications/read-all` |

---

## Dashboard (usability / cool features)

| Method | Path |
|--------|------|
| GET | `/api/dashboard/summary` |
| GET | `/api/dashboard/balance` |
| GET | `/api/dashboard/whos-away` |
| GET | `/api/dashboard/holidays` |
| GET | `/api/dashboard/export/my-leave.csv` |
| GET | `/api/dashboard/export/approvals.csv` |

---

## Error codes (Member 3 endpoints)

| Code | HTTP |
|------|------|
| VALIDATION_ERROR | 400 |
| INSUFFICIENT_BALANCE | 400 |
| INVALID_DATE_RANGE | 400 |
| MISSING_DATE_PARAMS | 400 |
| UNAUTHORISED | 401 |
| INVALID_CREDENTIALS | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| ALREADY_ACTIONED | 409 |
| ALREADY_CANCELLED | 409 |

---

## RBAC matrix (summary)

| Endpoint | Emp | Sup | Mgr | HR |
|----------|-----|-----|-----|-----|
| POST leave | own | own | own | own |
| GET approvals | empty / delegate | yes | yes | yes |
| approve/reject | delegate only | step1 | step2 | no |
| notifications | own | own | own | own |

---

*Aligned with HLD + implemented backend under `backend/`.*
