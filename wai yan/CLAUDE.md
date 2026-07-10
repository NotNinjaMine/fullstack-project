# CLAUDE.md — HR Leave Management System (Backend: Workflow & Notifications)

## What this is
Full-stack HR Leave Management System (SCCCI AI Challenge). Team project.
**This repo/scope = Member 3: Backend Lead – Workflow & Notifications.**
Stack: **Node.js + Express + PostgreSQL**. Auth = **JWT + bcrypt**. Email = **Nodemailer**.
SQL access via the **pg** library (parameterized queries only — never string-concat SQL).

## Detailed specs (read these before writing code — they are the source of truth)
- `docs/database-schema.md` (also at repo root) — full table DDL, constraints, indexes
- `docs/api-documentation.md` — exact request/response bodies, status codes, RBAC matrix
- `docs/use-cases.md` — UC-01/02/03/12 flows, business rules, notification triggers
Follow these exactly for field names, statuses, and flows. Do not invent endpoints or fields.

## Build these FULLY (my owned surface)
- Auth: `POST /api/auth/login`, `GET /api/auth/me`
- Leave: `GET /api/leave`, `POST /api/leave`, `GET /api/leave/:id`,
  `POST /api/leave/:id/cancel`, `GET /api/leave/overlap`
- Approvals (two-tier): `GET /api/approvals`, `PUT /api/approvals/:id/approve`,
  `PUT /api/approvals/:id/reject`
- Notifications: `GET /api/notifications`, `PUT /api/notifications/:id/read`,
  `PUT /api/notifications/read-all`
- Cross-cutting: JWT auth middleware, RBAC (`requireRole`), audit_log on every state change

## Build SIMPLIFIED local versions (owned by teammates, but my endpoints need them)
- `policyEngine` (Member 4): `calcDaysCount(start, end, halfDayFlag, countryCode)` excluding
  weekends + `public_holidays`; returns 0.5 for a valid half-day. Plus balance read/deduct/restore.
- `overlapService` (Member 4): find overlapping non-rejected/non-cancelled team leave in a range.
- DB schema + seed (Member 5): a working `schema.sql` + seed script so the app runs locally.

## OUT OF SCOPE — leave clean TODO hooks, do NOT implement
- AI-1 (natural-language leave parsing) and AI-3 (approver summary card).
  Accept the same structured payloads and leave commented integration points.

## Non-negotiable conventions
**Response envelope**
- Success: `{ "success": true, "data": {...} }`
- Error:   `{ "success": false, "code": "ERROR_CODE", "message": "..." }`

**Error codes (use these exact strings + statuses)**
`VALIDATION_ERROR`(400), `INSUFFICIENT_BALANCE`(400), `INVALID_DATE_RANGE`(400),
`MISSING_DATE_PARAMS`(400), `UNAUTHORISED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404),
`ALREADY_ACTIONED`(409), `ALREADY_CANCELLED`(409)

**leave_requests.status state machine**
- `pending` → `supervisor_approved` → `approved`
- `pending` | `supervisor_approved` → `rejected`
- `pending` → `cancelled` (direct, no balance change)
- `approved` | `supervisor_approved` → `cancel_pending` → `cancelled` (restore balance)

**Hard business rules**
- Both supervisor AND manager must approve. No auto-approval. Supervisor cannot be bypassed.
- Balance deducted ONLY on final manager approval. Restored ONLY on approved cancellation.
- Half-day requests must be a single calendar day (`start_date = end_date`).
- Weekends + public holidays excluded from `days_count`.
- EVERY state change (create/approve/reject/cancel) writes an `audit_log` row with
  `before_state` + `after_state` as JSONB. **This is a grading requirement.**
- Leave type is immutable after submission.
- The 24h reminder is a reminder only — it never auto-approves.
- No PII in email notification bodies.

## Target structure
```
backend/
  src/
    config/db.js
    middleware/  authMiddleware.js  rbacMiddleware.js  errorHandler.js
    controllers/ authController.js  leaveController.js  approvalController.js  notificationController.js
    services/    policyEngine.js  overlapService.js  auditService.js  notificationService.js
    routes/      authRoutes.js  leaveRoutes.js  approvalRoutes.js  notificationRoutes.js
    db/          schema.sql  seed.js
    utils/       response.js
    app.js
  server.js
  .env.example
  package.json
docs/            (the three spec files)
CLAUDE.md
```

## How to work (instructions for Claude Code)
- Work ONE phase at a time. After each phase, start the server and verify with real requests
  before moving on. Do not build ahead.
- Keep controllers thin; business logic lives in services.
- Wrap multi-step DB writes (approve, reject, cancel) in a transaction (state + balance + audit together).
- Commit after each passing phase.
- If unsure about a field, status, or flow, re-read the relevant `docs/*.md` — do not guess.
