# Database Schema Focus — Wai Yan Hpone Lat (Member 3)

## Responsibility
I own correct use of the **leave request state machine**, **approval routing**, **notifications**, and **immutable audit_log**. Schema is coordinated with Member 5; local SQLite + Postgres DDL both provided.

---

## Core: `leave_requests` state machine

```
pending → supervisor_approved → approved
pending | supervisor_approved → rejected
pending → cancelled
approved | supervisor_approved → cancel_pending → cancelled
```

| Field | Role in workflow |
|-------|------------------|
| `status` | Main state driver |
| `supervisor_id` / `manager_id` | Frozen reporting line at create |
| `supervisor_status` / `manager_status` | Tier tracking |
| `special_approval_flag` / `overlap_flag` | Coverage risk signals |
| `days_count` | Working days (policy engine) |
| `prior_status` | Used when cancelling approved leave |

### Constraints (integrity)
- `end_date >= start_date`
- Half-day ⇒ `start_date = end_date`
- Status / leave_type CHECK constraints

### Indexes used by my queries
- `(user_id)`, `(status)`, `(start_date, end_date)`
- `(supervisor_id, status)`, `(manager_id, status)`

---

## Balance: `leave_balances`

- Deduct **only** when manager sets final `approved`
- Restore **only** when cancel completes and `prior_status` was `approved`
- Unique `(user_id, year)`

---

## Notifications: `notifications`

Types I write:  
`leave_submitted`, `supervisor_approved`, `supervisor_rejected`, `approved`, `rejected`,  
`cancel_pending`, `overlap_warning`, `approval_reminder`

Index: `(user_id, read_flag)` for unread badge.

---

## Audit: `audit_log` (grading requirement)

Every create / approve / reject / cancel / delegation writes:

| Column | Content |
|--------|---------|
| `action` | e.g. `leave_request_supervisor_approved` |
| `actor_user_id` | Who performed the action |
| `entity_type` / `entity_id` | Usually `leave_request` + id |
| `before_state` | JSON snapshot (null on create) |
| `after_state` | JSON snapshot |

Demo tip: after an approval, query:

```sql
SELECT action, actor_user_id, before_state, after_state, created_at
FROM audit_log ORDER BY id DESC LIMIT 10;
```

---

## UC-15: `approval_delegations`

| Column | Meaning |
|--------|---------|
| `delegator_id` | Original approver |
| `delegate_id` | Acting approver |
| `start_date` / `end_date` | Active window |
| `active` | Soft revoke |

---

## Supporting tables I consume

- `users` — JWT identity, role, phone (WhatsApp), reporting line  
- `public_holidays` — days_count + calendar UI  
- `leave_policies` — seeded entitlements by country  

---

## Relationships (text ER)

```
users 1──* leave_requests (as applicant / supervisor / manager)
users 1──* leave_balances
users 1──* notifications
users 1──* audit_log (as actor)
users 1──* approval_delegations (delegator or delegate)
leave_requests 1──* notifications
```

---

## Local vs production

| Driver | File |
|--------|------|
| SQLite (local default) | `backend/src/db/schema.sqlite.sql` + seed |
| PostgreSQL | `backend/src/db/schema.sql` |

Parameterized queries only (`$1` / `?` via adapters) — no string-concat SQL.

---

*Shows understanding of workflow data model for individual submission.*
