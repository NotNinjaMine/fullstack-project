-- HR Leave Management System schema
-- Member 3 / Member 5 coordination

DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS min_staffing CASCADE;
DROP TABLE IF EXISTS blackout_periods CASCADE;
DROP TABLE IF EXISTS approval_delegations CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS holiday_fetch_log CASCADE;
DROP TABLE IF EXISTS public_holidays CASCADE;
DROP TABLE IF EXISTS leave_policies CASCADE;
DROP TABLE IF EXISTS company_offices CASCADE;
DROP TABLE IF EXISTS company_profile CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id               SERIAL        PRIMARY KEY,
  employee_id      VARCHAR(32)   UNIQUE,
  name             VARCHAR(255)  NOT NULL,
  email            VARCHAR(255)  NOT NULL UNIQUE,
  password_hash    VARCHAR(255)  NOT NULL,
  phone            VARCHAR(30),
  address          TEXT,
  personal_address TEXT,
  job_title        VARCHAR(120),
  department       VARCHAR(100),
  office_branch    VARCHAR(120),
  office_city      VARCHAR(80),
  office_country   VARCHAR(80),
  company_name     VARCHAR(200)  DEFAULT 'Apex Global Solutions Pte Ltd',
  company_address  TEXT,
  date_of_birth    DATE,
  join_date        DATE,
  gender           VARCHAR(10) CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say')),
  country_code     CHAR(2)       NOT NULL,
  role             VARCHAR(20)   NOT NULL
                   CHECK (role IN ('employee','supervisor','manager','hod','hr_admin')),
  supervisor_id    INT           REFERENCES users(id) ON DELETE SET NULL,
  manager_id       INT           REFERENCES users(id) ON DELETE SET NULL,
  hod_id           INT           REFERENCES users(id) ON DELETE SET NULL,
  notify_email     BOOLEAN       NOT NULL DEFAULT TRUE,
  notify_whatsapp  BOOLEAN       NOT NULL DEFAULT TRUE,
  telegram_chat_id VARCHAR(64),  -- optional Telegram chat id for bot notifications
  active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE leave_requests (
  id                     SERIAL      PRIMARY KEY,
  user_id                INT         NOT NULL REFERENCES users(id),
  leave_type             VARCHAR(20) NOT NULL
                         CHECK (leave_type IN ('annual','sick','unpaid','other')),
  start_date             DATE        NOT NULL,
  end_date               DATE        NOT NULL,
  half_day_flag          BOOLEAN     NOT NULL DEFAULT FALSE,
  half_day_period        VARCHAR(2)
                         CHECK (half_day_period IS NULL OR half_day_period IN ('AM','PM')),
  remarks                TEXT,
  applicant_name_override VARCHAR(255),
  applicant_department_override VARCHAR(100),
  days_count             DECIMAL(5,1) NOT NULL DEFAULT 0,
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
  prior_status           VARCHAR(20),
  created_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_date_order   CHECK (end_date >= start_date),
  CONSTRAINT chk_half_day_one CHECK (half_day_flag = FALSE OR start_date = end_date)
);

CREATE INDEX idx_leave_requests_user_id ON leave_requests (user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests (status);
CREATE INDEX idx_leave_requests_dates ON leave_requests (start_date, end_date);
CREATE INDEX idx_leave_requests_supervisor ON leave_requests (supervisor_id, status);
CREATE INDEX idx_leave_requests_manager ON leave_requests (manager_id, status);

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

CREATE TABLE notifications (
  id                SERIAL       PRIMARY KEY,
  user_id           INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              VARCHAR(50)  NOT NULL,
  message           TEXT         NOT NULL,
  read_flag         BOOLEAN      NOT NULL DEFAULT FALSE,
  leave_request_id  INT          REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_flag);

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

CREATE TABLE public_holidays (
  id             SERIAL       PRIMARY KEY,
  holiday_date   DATE         NOT NULL,
  country_code   CHAR(2)      NOT NULL,
  holiday_name   VARCHAR(255) NOT NULL,
  description    TEXT,
  UNIQUE (holiday_date, country_code)
);

-- Tracks which year+country PH packs are already in DB.
-- Missing → holidayService fetches online only when a user searches that year.
CREATE TABLE holiday_fetch_log (
  country_code   VARCHAR(2)  NOT NULL,
  year           INT         NOT NULL,
  source         VARCHAR(32) NOT NULL,
  holiday_count  INT         NOT NULL DEFAULT 0,
  fetched_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (country_code, year)
);

-- HR-editable company profile + multi-country offices
CREATE TABLE company_profile (
  id                 INT PRIMARY KEY CHECK (id = 1),
  name               VARCHAR(255) NOT NULL,
  short_name         VARCHAR(120),
  reg_no             VARCHAR(64),
  hq_country         VARCHAR(80),
  hq_country_code    CHAR(2),
  hq_address         TEXT,
  staff_count        INT,
  industry           VARCHAR(255),
  timezone_primary   VARCHAR(64),
  website            VARCHAR(255),
  description        TEXT,
  updated_at         TIMESTAMP,
  updated_by         INT
);

CREATE TABLE company_offices (
  code          CHAR(2) PRIMARY KEY,
  country       VARCHAR(80) NOT NULL,
  flag          VARCHAR(16),
  branch        VARCHAR(160) NOT NULL,
  city          VARCHAR(120),
  address       TEXT,
  approx_staff  INT DEFAULT 0,
  is_hq         BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT NOT NULL DEFAULT 0,
  phone         VARCHAR(40),
  email         VARCHAR(255),
  notes         TEXT
);

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

-- UC-15: Approval Delegation / Acting Approver
CREATE TABLE approval_delegations (
  id             SERIAL PRIMARY KEY,
  delegator_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_delegation_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_delegations_delegate ON approval_delegations (delegate_id, active);
CREATE INDEX idx_delegations_delegator ON approval_delegations (delegator_id, active);
