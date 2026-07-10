-- SQLite schema for local quick testing

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS leave_balances;
DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS holiday_fetch_log;
DROP TABLE IF EXISTS public_holidays;
DROP TABLE IF EXISTS leave_policies;
DROP TABLE IF EXISTS approval_delegations;
DROP TABLE IF EXISTS company_offices;
DROP TABLE IF EXISTS company_profile;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      TEXT UNIQUE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  phone            TEXT,
  address          TEXT,
  personal_address TEXT,
  job_title        TEXT,
  department       TEXT,
  office_branch    TEXT,
  office_city      TEXT,
  office_country   TEXT,
  company_name     TEXT DEFAULT 'Apex Global Solutions Pte Ltd',
  company_address  TEXT,
  date_of_birth    TEXT,
  join_date        TEXT,
  gender           TEXT CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say')),
  country_code     TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('employee','supervisor','manager','hod','hr_admin')),
  supervisor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  manager_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  hod_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notify_email     INTEGER NOT NULL DEFAULT 1,
  notify_whatsapp  INTEGER NOT NULL DEFAULT 1,
  telegram_chat_id TEXT,  -- optional Telegram chat id for bot notifications
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leave_requests (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                INTEGER NOT NULL REFERENCES users(id),
  leave_type             TEXT NOT NULL CHECK (leave_type IN ('annual','sick','unpaid','other')),
  start_date             TEXT NOT NULL,
  end_date               TEXT NOT NULL,
  half_day_flag          INTEGER NOT NULL DEFAULT 0,
  half_day_period        TEXT CHECK (half_day_period IS NULL OR half_day_period IN ('AM','PM')),
  remarks                TEXT,
  applicant_name_override VARCHAR(255),
  applicant_department_override VARCHAR(100),
  days_count             REAL NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending','supervisor_approved','approved',
                           'rejected','cancel_pending','cancelled'
                         )),
  supervisor_id          INTEGER NOT NULL REFERENCES users(id),
  supervisor_status      TEXT NOT NULL DEFAULT 'pending'
                         CHECK (supervisor_status IN ('pending','approved','rejected')),
  supervisor_note        TEXT,
  manager_id             INTEGER NOT NULL REFERENCES users(id),
  manager_status         TEXT NOT NULL DEFAULT 'pending'
                         CHECK (manager_status IN ('pending','approved','rejected')),
  manager_note           TEXT,
  special_approval_flag  INTEGER NOT NULL DEFAULT 0,
  overlap_flag           INTEGER NOT NULL DEFAULT 0,
  prior_status           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date >= start_date),
  CHECK (half_day_flag = 0 OR start_date = end_date)
);

CREATE INDEX idx_leave_requests_user_id ON leave_requests (user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests (status);
CREATE INDEX idx_leave_requests_dates ON leave_requests (start_date, end_date);
CREATE INDEX idx_leave_requests_supervisor ON leave_requests (supervisor_id, status);
CREATE INDEX idx_leave_requests_manager ON leave_requests (manager_id, status);

CREATE TABLE leave_balances (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year                INTEGER NOT NULL,
  annual_entitlement  REAL NOT NULL,
  annual_balance      REAL NOT NULL,
  sick_balance        REAL NOT NULL,
  carried_forward     REAL NOT NULL DEFAULT 0,
  UNIQUE (user_id, year)
);

CREATE TABLE notifications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  message           TEXT NOT NULL,
  read_flag         INTEGER NOT NULL DEFAULT 0,
  leave_request_id  INTEGER REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_flag);

CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  action          TEXT NOT NULL,
  actor_user_id   INTEGER NOT NULL REFERENCES users(id),
  entity_type     TEXT NOT NULL,
  entity_id       INTEGER NOT NULL,
  before_state    TEXT,
  after_state     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE public_holidays (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date   TEXT NOT NULL,
  country_code   TEXT NOT NULL,
  holiday_name   TEXT NOT NULL,
  description    TEXT,
  UNIQUE (holiday_date, country_code)
);

-- Tracks which year+country PH packs are already in DB (online/seed/template).
-- Missing rows → holidayService fetches online only when a user searches that year.
CREATE TABLE holiday_fetch_log (
  country_code   TEXT NOT NULL,
  year           INTEGER NOT NULL,
  source         TEXT NOT NULL,
  holiday_count  INTEGER NOT NULL DEFAULT 0,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (country_code, year)
);

-- HR-editable company profile + multi-country offices
CREATE TABLE company_profile (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  name               TEXT NOT NULL,
  short_name         TEXT,
  reg_no             TEXT,
  hq_country         TEXT,
  hq_country_code    TEXT,
  hq_address         TEXT,
  staff_count        INTEGER,
  industry           TEXT,
  timezone_primary   TEXT,
  website            TEXT,
  description        TEXT,
  updated_at         TEXT,
  updated_by         INTEGER
);

CREATE TABLE company_offices (
  code          TEXT PRIMARY KEY,
  country       TEXT NOT NULL,
  flag          TEXT,
  branch        TEXT NOT NULL,
  city          TEXT,
  address       TEXT,
  approx_staff  INTEGER DEFAULT 0,
  is_hq         INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  phone         TEXT,
  email         TEXT,
  notes         TEXT
);

CREATE TABLE leave_policies (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code        TEXT NOT NULL UNIQUE,
  annual_min          INTEGER NOT NULL,
  annual_max          INTEGER NOT NULL,
  sick_with_mc        INTEGER NOT NULL,
  sick_no_mc          INTEGER NOT NULL DEFAULT 0,
  carry_forward_max   INTEGER NOT NULL DEFAULT 5,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- UC-15: Approval Delegation / Acting Approver
CREATE TABLE approval_delegations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  delegator_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_delegations_delegate ON approval_delegations (delegate_id, active);
CREATE INDEX idx_delegations_delegator ON approval_delegations (delegator_id, active);
