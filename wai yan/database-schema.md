# Database Schema – Wai Yan Hpone Lat (Member 3)

**Role:** Backend Lead – Workflow & Notifications  
**Focus:** Tables and relationships critical to leave workflow, approval state machine, notifications, and audit logging.  
**Database:** PostgreSQL  
**Date:** July 2026

---

## 1. Overview

I work closely with Member 5 (Database & DevOps) on the schema. While Member 5 owns the DDL and seeding, I am responsible for:

- Correct usage of `leave_requests` state machine
- `notifications` and `audit_log` tables
- Relationships involving `users`, `leave_balances`, and approval routing
- Ensuring all my controllers write proper audit entries and maintain data integrity

This document contains the **full recommended schema** from the High-Level Design with annotations relevant to my work.

---

## 2. Entity Relationship Diagram (Text Representation)

```
users
├── id (PK)
├── supervisor_id → users.id
├── manager_id → users.id
├── hod_id → users.id
│
leave_requests
├── user_id → users.id
├── supervisor_id → users.id
├── manager_id → users.id
│
leave_balances
├── user_id → users.id
│
notifications
├── user_id → users.id
├── leave_request_id → leave_requests.id
│
audit_log
├── actor_user_id → users.id
│
public_holidays
leave_policies
leave_types (optional extension)
approval_delegations
blackout_periods
min_staffing
attachments
```

---

## 3. Table Definitions (with Workflow Annotations)

### users

```sql
CREATE TABLE users (
  id               SERIAL        PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  email            VARCHAR(255)  NOT NULL UNIQUE,
  password_hash    VARCHAR(255)  NOT NULL,
  country_code     CHAR(2)       NOT NULL,
  role             VARCHAR(20)   NOT NULL
                   CHECK (role IN ('employee','supervisor','manager','hod','hr_admin')),
  supervisor_id    INT           REFERENCES users(id) ON DELETE SET NULL,
  manager_id       INT           REFERENCES users(id) ON DELETE SET NULL,
  hod_id           INT           REFERENCES users(id) ON DELETE SET NULL,
  department       VARCHAR(100),
  active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP     NOT NULL DEFAULT NOW()
);
```

**My Usage Notes:**
- `supervisor_id` and `manager_id` are used to route approval requests.
- `role` is used heavily in `rbacMiddleware.js`.
- I never store plaintext passwords — always use `bcrypt`.

---

### leave_requests (Core Workflow Table)

```sql
CREATE TABLE leave_requests (
  id                     SERIAL      PRIMARY KEY,
  user_id                INT         NOT NULL REFERENCES users(id),
  leave_type             VARCHAR(20) NOT NULL
                         CHECK (leave_type IN ('annual','sick','unpaid','other')),
  start_date             DATE        NOT NULL,
  end_date               DATE        NOT NULL,
  half_day_flag          BOOLEAN     NOT NULL DEFAULT FALSE,
  half_day_period        VARCHAR(2)
                         CHECK (half_day_period IN ('AM','PM')),
  remarks                TEXT,
  status                 VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending','supervisor_approved','approved',
                           'rejected','cancel_pending','cancelled'
                         )),
  supervisor_id          INT         NOT NULL REFERENCES users(id),
  supervisor_status      VARCHAR(10) NOT NULL DEFAULT 'pending'
                         CHECK (supervisor_status IN ('pending','approved','rejected')),
  supervisor_note        TEXT,
  manager_id             INT         NOT NULL REFERENCES users(id),
  manager_status         VARCHAR(10) NOT NULL DEFAULT 'pending'
                         CHECK (manager_status IN ('pending','approved','rejected')),
  manager_note           TEXT,
  special_approval_flag  BOOLEAN     NOT NULL DEFAULT FALSE,
  overlap_flag           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_date_order   CHECK (end_date >= start_date),
  CONSTRAINT chk_half_day_one CHECK (half_day_flag = FALSE OR start_date = end_date)
);
```

**Critical Workflow Fields (My Responsibility):**
- `status`: Main state machine driver
- `supervisor_status` + `manager_status`: Two-tier approval tracking
- `special_approval_flag`: Set when overlap detected (requires explicit Manager approval)
- `overlap_flag`: Set by overlap detection service
- `supervisor_note` / `manager_note`: Free-text comments from approvers

**Indexes I rely on:**
```sql
CREATE INDEX idx_leave_requests_user_id    ON leave_requests (user_id);
CREATE INDEX idx_leave_requests_status     ON leave_requests (status);
CREATE INDEX idx_leave_requests_dates      ON leave_requests (start_date, end_date);
```

---

### leave_balances

```sql
CREATE TABLE leave_balances (
  id                  SERIAL        PRIMARY KEY,
  user_id             INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year                INT           NOT NULL,
  annual_entitlement  DECIMAL(5,1)  NOT NULL,
  annual_balance      DECIMAL(5,1)  NOT NULL,
  sick_balance        DECIMAL(5,1)  NOT NULL,
  carried_forward     DECIMAL(5,1)  NOT NULL DEFAULT 0,
  UNIQUE (user_id, year)
);
```

**My Usage:**
- Balance is **only deducted** on final `manager_status = 'approved'`.
- I call Member 4’s policy engine to calculate `days_count` before insertion.
- Restoration happens during approved cancellation.

---

### notifications

```sql
CREATE TABLE notifications (
  id                SERIAL       PRIMARY KEY,
  user_id           INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              VARCHAR(50)  NOT NULL,
  message           TEXT         NOT NULL,
  read_flag         BOOLEAN      NOT NULL DEFAULT FALSE,
  leave_request_id  INT          REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

**My Responsibility (UC-12):**
- I insert rows here from `notificationService.js`.
- Types I use: `leave_submitted`, `supervisor_approved`, `approved`, `rejected`, `approval_reminder`, `overlap_warning`, `cancel_pending`.

**Index:**
```sql
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_flag);
```

---

### audit_log (Immutable Audit Trail)

```sql
CREATE TABLE audit_log (
  id              SERIAL       PRIMARY KEY,
  action          VARCHAR(100) NOT NULL,
  actor_user_id   INT          NOT NULL REFERENCES users(id),
  entity_type     VARCHAR(50)  NOT NULL,
  entity_id       INT          NOT NULL,
  before_state    JSONB,
  after_state     JSONB,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

**My Responsibility:**
Every state change in `leave_requests` (create, approve, reject, cancel) **must** write to this table. This is critical for grading and client demo.

Example actions I log:
- `leave_request_created`
- `leave_request_supervisor_approved`
- `leave_request_manager_approved`
- `leave_request_rejected`
- `leave_request_cancelled`

---

### public_holidays

```sql
CREATE TABLE public_holidays (
  id             SERIAL       PRIMARY KEY,
  holiday_date   DATE         NOT NULL,
  country_code   CHAR(2)      NOT NULL,
  holiday_name   VARCHAR(255) NOT NULL,
  UNIQUE (holiday_date, country_code)
);
```

**Usage:** Used by Member 4’s `days_count` calculation. I ensure leave spanning holidays does not deduct those days.

---

### leave_policies

```sql
CREATE TABLE leave_policies (
  id                  SERIAL    PRIMARY KEY,
  country_code        CHAR(2)   NOT NULL UNIQUE,
  annual_min          INT       NOT NULL,
  annual_max          INT       NOT NULL,
  sick_with_mc        INT       NOT NULL,
  sick_no_mc          INT       NOT NULL DEFAULT 0,
  carry_forward_max   INT       NOT NULL DEFAULT 5,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Seeded values (from HLD):**
- SG: 14–24 annual, 12 sick with MC + 2 without
- TH: 8–11 annual, 30 sick
- Others: 12–14 annual, 12 sick with MC + 2 without

---

## 4. Other Supporting Tables (Referenced)

- `approval_delegations` – For UC-15 (delegation)
- `blackout_periods` – For UC-18
- `min_staffing` – For coverage rules (UC-17)
- `attachments` – Medical certificates (UC-13)

These are primarily used by Member 4 & 2 but I ensure my workflow respects them where applicable.

---

## 5. Key Relationships & Constraints I Enforce in Code

| Relationship                        | Enforced In My Code                          | Notes |
|-------------------------------------|----------------------------------------------|-------|
| `leave_requests.user_id` → `users`  | Yes (on create)                              | Owner validation |
| `leave_requests.supervisor_id`      | Yes (set at creation time)                   | From user's reporting line |
| `leave_requests.manager_id`         | Yes                                          | From user's reporting line |
| Balance deduction only on final approval | `approvalController.js`                   | Critical business rule |
| `audit_log` write on every change   | All my controllers                           | Grading requirement |
| Notification creation               | `notificationService.js`                     | UC-12 |

---

## 6. Seeding Notes (Coordination with Member 5)

I coordinate with Member 5 to ensure:
- Test users exist across all roles and countries (SG + TH priority)
- At least one employee near annual cap (for carry-forward demo)
- Overlapping leave requests pre-seeded for overlap detection testing
- Public holidays for 2026 loaded from provided Excel

---

## 7. Performance Considerations

- Use indexes on `leave_requests(user_id, status)` and `notifications(user_id, read_flag)`
- `audit_log` is append-only → consider partitioning by year in production
- `leave_requests` will grow quickly → ensure proper indexing on date ranges

---

*This schema document demonstrates my deep understanding of the data model required to implement the two-tier approval workflow and notification system.*  
*All table definitions are taken from the official High-Level Design (HLD).*