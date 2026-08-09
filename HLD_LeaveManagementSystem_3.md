# Annual Leave Management System — High-Level Design

> **Challenge:** SCCCI AI Challenge · Problem 2B — Annual Leave Tracking & Approval
> **Stack:** React.js (frontend) · Node.js + Express (backend) · PostgreSQL · Hosted LLM API
> **Team:** 5 members — full-stack verticals (each owns 6–7 use cases end-to-end)
> **Version:** 3.0 (AI-Enhanced, 30 Use Cases) · **Date:** 12 July 2026

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Key Lifecycle Flows](#2-key-lifecycle-flows)
3. [Project Structure](#3-project-structure)
4. [Permitted Dependencies](#4-permitted-dependencies)
5. [Database Schema](#5-database-schema)
6. [API Specification](#6-api-specification)
7. [Role × Endpoint Access Matrix](#7-role--endpoint-access-matrix)
8. [AI Layer Design & Safety](#8-ai-layer-design--safety)
9. [Security & RBAC](#9-security--rbac)

---

## 1. System Architecture

### 1.1 Architecture Overview

The system is a **modular monolith**: one React single-page app, one Node.js/Express API, and one PostgreSQL database. Three external services are called from the backend only — a hosted LLM API (for the five AI features), an SMTP server (email), and file storage (for medical certificates). A single scheduled job (`node-cron`) runs the year-end carry-forward. This keeps the deployable surface small while still delivering the AI capabilities the challenge requires.

```mermaid
graph TD
    subgraph L1["Layer 1 — Client (React.js + Tailwind)"]
        UI["Browser / Mobile Browser<br/>React · Vite · Tailwind<br/>FullCalendar · Axios<br/>react-i18next · Recharts"]
    end

    subgraph L2["Layer 2 — Application Logic (Node.js + Express)"]
        API["REST API Server<br/>JWT Auth · RBAC Middleware<br/>Express Router · Zod Validation"]
        SVC["Domain Services<br/>Leave · Approval Routing<br/>Coverage · Policy · Calculation<br/>Notifications · Reporting"]
        AISVC["AI Service<br/>LLM Provider Adapter<br/>NL Parse · Coverage · Summary<br/>Query Catalogue · Anomaly"]
        JOB["Scheduled Job (node-cron)<br/>Year-End Carry-Forward<br/>Dec 31 23:59 SGT"]
    end

    subgraph L3["Layer 3 — Data (PostgreSQL)"]
        DB[("PostgreSQL<br/>users · leave_requests<br/>leave_balances · policies<br/>attachments · audit_log<br/>ai_interactions · +7 more")]
    end

    LLM["Hosted LLM API<br/>Claude / GPT / Gemini"]
    SMTP["SMTP Email Server"]
    FILES["File Storage<br/>MC / documents"]

    UI -->|HTTPS / JSON REST| API
    API --> SVC
    API --> AISVC
    SVC --> DB
    AISVC --> DB
    AISVC -->|minimal context · no PII| LLM
    JOB --> SVC
    SVC --> SMTP
    SVC --> FILES
```

**Independence for parallel work:** the three boxes are the only integration seams. The React app talks to the API solely over JSON REST; the API is the only thing that touches the database, the LLM, email, or file storage. A member can change a controller or a component without breaking another member's file, provided the JSON contracts in Section 6 hold.

### 1.2 Module → Owner Mapping (full-stack verticals)

Each member owns one role end-to-end — **both** the frontend and the backend for their area. Workload is balanced to **6 use cases per member** (Member 2 carries 7, since the core employee flow is the system's most-used path). Shared foundations (auth, database, deployment, responsive shell) sit with Member 1 and are consumed by everyone. Enhanced features are marked (E).

| Vertical (Member) | Frontend | Backend | Use cases |
|-------------------|----------|---------|-----------|
| **M1 — Platform, Identity & Self-Service** | Login/forgot-password, role-based nav shell, protected routing, shared component library, responsive framework, bulk entitlement/pro-ration screen, self-service profile, preferences & locale switcher (E), invitation send form + onboarding tour, session management + security log panel, announcement compose/targeting screen + banner/modal | JWT auth, sessions, bcrypt, RBAC middleware, DB schema & migrations, deployment/CI, bulk entitlement & pro-ration logic, profile & preference APIs, i18n backend (E), invite token generation + expiry + registration API, session table + revoke endpoint + lockout logic, announcements table + targeting engine + acknowledgement API | UC-09, UC-20, UC-23, UC-24, UC-25, UC-26 |
| **M2 — Employee Leave Experience** | Apply form (full/half-day AM-PM), dashboard, personal calendar & history, cancellation & drafts, status stepper, sick-leave form with MC/no-MC toggle, MC upload (E), balance forecast & `.ics` export (E), leave swap proposal + incoming swap inbox (E), AI-1 input box | Leave CRUD & draft API, balance deduct/restore, cancellation workflow, sick-leave quota logic (MC vs no-MC per country), MC upload & secure storage (E), iCal endpoint (E), swap state machine + paired atomic balance update (E), AI-1 NL parsing | UC-01, UC-03, UC-05, UC-08 (staff), UC-13, UC-14, UC-27, AI-1 |
| **M3 — Approval, Delegation & Notification** | Approval queue, detail view with AI-3 card + comment thread panel, bulk approve/reject (E), delegation setup (E), notification center, approver team-schedule | Two-tier routing state machine, approve/reject + comments + audit, bulk-action endpoint (E), delegation engine with auto-expiry (E), notification service + 24h reminder scheduler, comment thread API (append-only, locked on decision), AI-3 summaries | UC-02, UC-08 (approver), UC-12, UC-15, UC-16, UC-28, AI-3 |
| **M4 — Coverage, Calendar & Scheduling-Rules** | Team calendar with overlap highlights, coverage banners + AI-2 panel, manpower heatmap (E), blackout management (E), holiday display, weekend-configuration screen per country | Overlap & coverage-threshold engine, working-day/holiday-aware calculation (reads weekend config), country weekend-days config table, country policy engine, min-staffing & blackout rules (E), holiday import + sync, AI-2 analyzer | UC-06, UC-07, UC-17, UC-18, UC-19, UC-29, AI-2 |
| **M5 — HR Admin, Analytics & Automation** | HR admin panel, HR dashboard + AI-5 flags (E), reporting suite (E), audit viewer (E), scheduled report delivery management screen (E), AI-4 chatbot UI | Employee/policy/leave-type API + CSV import, carry-forward job (node-cron, SGT), reporting & export (E), audit query API (E), report-schedule table + cron dispatch (E), AI-4 catalogue + AI-5 anomaly (E) | UC-04, UC-10, UC-11, UC-21, UC-22, UC-30, AI-4/AI-5 |

**Shared contracts (agree early):** the working-day/holiday-aware calculation (M4, UC-19) reads the weekend config (M4, UC-29) and is the single source of truth for leave duration — M2 and M5 call it, never re-implement it. The country policy data (M4) feeds carry-forward (M5) and sick-leave logic (M2). The team-calendar component (M4) is reused by the employee view (M2) and approver view (M3) as a shared component. Notification preferences (M1, UC-23) are read by the notification service (M3, UC-12). The invitation flow (M1, UC-24) triggers pro-ration (M1, UC-20) on account activation — both self-contained within M1. Comment-thread notifications (M3, UC-28) reuse the same notification service pattern as approvals. RBAC (M1) is enforced centrally; each member renders their own persona's views within those permissions.

### 1.3 The AI Layer in one paragraph

All five AI features are served by a single backend **AI Service** that wraps a hosted LLM behind a provider-agnostic adapter (Claude, GPT, or Gemini — a team decision, swappable via config). Requests carry only the minimum context needed and **never** raw PII. The HR chatbot (AI-4) does **not** generate SQL: the LLM classifies each question against a fixed catalogue of parameterised queries and extracts parameters, and the backend runs the matching pre-defined query. Every AI call is logged to `ai_interactions` for observability and cost tracking. Details in Section 8.

---

## 2. Key Lifecycle Flows

### 2.1 Leave Request with AI Assistance (UC-01, UC-02, UC-07)

```mermaid
sequenceDiagram
    actor E as Employee
    participant UI as React UI
    participant API as Express API
    participant AI as AI Service
    participant DB as PostgreSQL
    participant S as Supervisor
    participant M as Manager

    E->>UI: Open team calendar (teammate leave + holidays)
    opt Natural-language input (AI-1)
        E->>UI: Type request in plain language
        UI->>API: POST /api/ai/parse-leave
        API->>AI: Parse text to fields
        AI-->>API: dates, type, half-day flag
        API-->>UI: Pre-filled form for confirmation
    end
    E->>API: POST /api/leave (dates, type, half/full-day)
    API->>DB: Overlap check + coverage + working-day calc
    alt Coverage below threshold
        API->>AI: Explain impact + suggest dates (AI-2)
        AI-->>API: Explanation + alternative range
        API-->>E: Warning — amend or flag special approval
    else Coverage sufficient
        API->>DB: Persist (status = PENDING, awaiting Supervisor)
    end
    API->>S: Notify (in-app + email)
    S->>API: GET /api/approvals/:id
    API->>AI: Generate approval summary (AI-3)
    AI-->>API: Pattern + coverage + recommendation
    S->>API: Approve (step 1)
    API->>M: Route to Manager + notify
    M->>API: Approve (step 2, final)
    API->>DB: Deduct balance + write audit_log
    API->>E: Notify approved
```

The balance is deducted **only** on the Manager's final approval. If coverage drops below the configured threshold, the request is flagged `special_approval_flag` and the Manager must explicitly approve the exception. The Supervisor can never be bypassed.

### 2.2 Year-End Carry-Forward (UC-04)

```mermaid
flowchart TD
    A["node-cron trigger<br/>Dec 31 23:59 SGT (UTC+8)"] --> B["For each employee:<br/>compute unused annual leave"]
    B --> C{"Unused greater than 5 days?"}
    C -->|Yes| D["Carry 5 days forward<br/>Forfeit remainder + log to audit"]
    C -->|No| E["Carry all unused forward"]
    D --> F["Reset new-year entitlement<br/>per country policy"]
    E --> F
    F --> G["Write carry-forward summary<br/>Notify Employee + HR Admin"]
```

A manual trigger (`POST /api/admin/carry-forward/trigger`) runs the same routine for the live demo. Bulk yearly entitlement assignment and new-joiner pro-ration (UC-20) run alongside but are a distinct HR action.

### 2.3 HR Insights Chatbot (AI-4, UC-11)

```mermaid
sequenceDiagram
    actor H as HR / Manager / HOD
    participant UI as Chatbot Panel
    participant API as Express API
    participant AI as AI Service
    participant DB as PostgreSQL

    H->>UI: Ask a question in natural language
    UI->>API: POST /api/ai/insights
    API->>AI: Classify against fixed query catalogue
    AI-->>API: matched_template + extracted params
    alt Template matched
        API->>DB: Run pre-defined parameterised query
        DB-->>API: Result rows
        API->>AI: Compose textual answer from data
        AI-->>API: Answer text
        API-->>UI: Answer + chart data
    else No template matches
        API-->>UI: Closest available reports (no guessing)
    end
    API->>DB: Log to ai_interactions
```

The LLM never sees raw rows beyond the minimum needed to phrase the answer, and never emits SQL — this is the core prompt-injection / data-exfiltration guard.

### 2.4 Leave Swap Request (UC-27)

```mermaid
sequenceDiagram
    actor A as Employee A
    actor B as Employee B
    participant API as Express API
    participant DB as PostgreSQL
    participant S as Supervisor
    participant M as Manager

    A->>API: POST /api/swaps (propose swap of approved dates)
    API->>DB: Validate same Supervisor + create leave_swap_requests (PENDING_ACCEPT)
    API->>B: Notify — swap proposal (expires in 48h)
    alt B accepts within 48h
        B->>API: PUT /api/swaps/:id/accept
        API->>DB: Status -> PENDING_APPROVAL
        API->>S: Notify — swap awaiting approval
        S->>API: Approve
        API->>M: Route to Manager
        M->>API: Approve (final)
        API->>DB: Atomically update BOTH leave_requests (all-or-nothing)
        API->>A: Notify approved (dates swapped, balance unchanged)
        API->>B: Notify approved (dates swapped, balance unchanged)
    else B declines or 48h expires
        API->>DB: Status -> REJECTED or EXPIRED
        API->>A: Notify — swap did not proceed, original leave unchanged
    end
```

Both employees must share the same Supervisor for a swap to be valid. Dates swap, not day counts — balances are unaffected. The paired update either fully succeeds or fully rolls back, so the two leave entries never diverge.

---

## 3. Project Structure

A single repository with two top-level apps. Files are grouped by feature so each vertical owner works mostly within their own folders. Owner tags (M1–M5) are annotations, not directories.

```
leave-management-system/
├── README.md
├── .gitignore
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx                      # M1
│       ├── App.jsx                       # M1 — router + protected routes
│       ├── index.css                     # M1 — Tailwind base
│       ├── i18n.js                       # M1 — react-i18next setup (E)
│       ├── services/
│       │   ├── api.js                    # M1 — Axios instance + JWT interceptor
│       │   ├── authService.js            # M1
│       │   ├── invitationService.js      # M1 — UC-24
│       │   ├── sessionService.js         # M1 — UC-25
│       │   ├── announcementService.js    # M1 — UC-26
│       │   ├── leaveService.js           # M2
│       │   ├── swapService.js            # M2 — UC-27 (E)
│       │   ├── approvalService.js        # M3
│       │   ├── commentService.js         # M3 — UC-28
│       │   ├── calendarService.js        # M4
│       │   ├── adminService.js           # M5
│       │   └── aiService.js              # all — thin client for /api/ai/*
│       ├── context/
│       │   ├── AuthContext.jsx           # M1
│       │   └── NotificationContext.jsx   # M3
│       ├── hooks/
│       │   └── useAuth.js                # M1
│       ├── components/
│       │   ├── common/                   # M1 — Navbar, Sidebar, ProtectedRoute, StatusBadge, Spinner, AnnouncementBanner
│       │   ├── employee/                 # M2 — LeaveApplicationForm, SickLeaveForm, BalanceCard, HistoryTable, StatusStepper, McUpload, NlInputBox, SwapProposalForm, SwapInbox
│       │   ├── approval/                 # M3 — ApprovalCard, AiSummaryCard, BulkActionBar, DelegationForm, CommentThread
│       │   ├── calendar/                 # M4 — TeamCalendar, CoverageBanner, Ai2Panel, Heatmap, BlackoutManager, HolidayLegend, WeekendConfigForm
│       │   └── admin/                    # M5 — EmployeeTable, PolicyConfig, LeaveTypeConfig, ReportPanel, AuditViewer, ChatbotPanel, AnomalyFlags, ReportScheduleManager
│       └── pages/
│           ├── LoginPage.jsx             # M1
│           ├── RegisterPage.jsx          # M1 — UC-24 onboarding tour
│           ├── ProfilePage.jsx           # M1 — profile, preferences, sessions & security log (UC-23, UC-25)
│           ├── AdminInvitePage.jsx       # M1 — UC-24
│           ├── AdminAnnouncementsPage.jsx # M1 — UC-26 (E)
│           ├── DashboardPage.jsx         # M2
│           ├── LeaveApplyPage.jsx        # M2
│           ├── LeaveHistoryPage.jsx      # M2
│           ├── ApprovalQueuePage.jsx     # M3
│           ├── CalendarPage.jsx          # M4
│           ├── CoveragePage.jsx          # M4 (E)
│           └── AdminPage.jsx             # M5
└── backend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── server.js                     # M1 — entry point
        ├── app.js                        # M1 — Express app + route mounting
        ├── config/
        │   ├── db.js                     # M1 — pg Pool
        │   ├── env.js                    # M1
        │   └── llm.js                    # all — LLM provider adapter config
        ├── middleware/
        │   ├── authMiddleware.js         # M1 — verify JWT
        │   ├── rbacMiddleware.js         # M1 — requireRole(...)
        │   └── errorHandler.js           # M1 — standard error envelope
        ├── routes/                       # one router per vertical
        │   ├── authRoutes.js             # M1
        │   ├── profileRoutes.js          # M1
        │   ├── invitationRoutes.js       # M1 — UC-24
        │   ├── sessionRoutes.js          # M1 — UC-25
        │   ├── announcementRoutes.js     # M1 — UC-26 (E)
        │   ├── entitlementRoutes.js      # M1 — UC-20 (E)
        │   ├── leaveRoutes.js            # M2
        │   ├── attachmentRoutes.js       # M2 (E)
        │   ├── swapRoutes.js             # M2 — UC-27 (E)
        │   ├── approvalRoutes.js         # M3
        │   ├── delegationRoutes.js       # M3 (E)
        │   ├── commentRoutes.js          # M3 — UC-28
        │   ├── notificationRoutes.js     # M3
        │   ├── calendarRoutes.js         # M4
        │   ├── holidayRoutes.js          # M4
        │   ├── coverageRoutes.js         # M4 (E)
        │   ├── weekendConfigRoutes.js    # M4 — UC-29
        │   ├── adminRoutes.js            # M5
        │   ├── reportRoutes.js           # M5 (E)
        │   ├── reportScheduleRoutes.js   # M5 — UC-30 (E)
        │   └── aiRoutes.js               # all — /api/ai/*
        ├── controllers/                  # mirror the routes (one per vertical)
        ├── services/
        │   ├── invitationService.js      # M1 — UC-24
        │   ├── sessionService.js         # M1 — UC-25 (session table, lockout)
        │   ├── announcementService.js    # M1 — UC-26 (E)
        │   ├── entitlementService.js     # M1 — UC-20 bulk update & pro-ration (E)
        │   ├── leaveService.js           # M2
        │   ├── balanceService.js         # M2 / M5
        │   ├── swapService.js            # M2 — UC-27 state machine + atomic update (E)
        │   ├── approvalService.js        # M3
        │   ├── commentService.js         # M3 — UC-28 append-only thread
        │   ├── notificationService.js    # M3
        │   ├── coverageService.js        # M4
        │   ├── calculationService.js     # M4 — SINGLE source of truth for days; reads weekend config
        │   ├── weekendConfigService.js   # M4 — UC-29
        │   ├── policyService.js          # M4
        │   ├── carryForwardService.js    # M5
        │   ├── reportService.js          # M5 (E)
        │   ├── reportScheduleService.js  # M5 — UC-30 cron dispatch (E)
        │   └── ai/
        │       ├── llmClient.js          # all — provider adapter (Claude/GPT/Gemini)
        │       ├── parseLeave.js         # M2 — AI-1
        │       ├── coverageAnalyzer.js   # M4 — AI-2
        │       ├── approvalSummary.js    # M3 — AI-3
        │       ├── queryCatalogue.js     # M5 — AI-4 (fixed parameterised queries)
        │       └── anomalyDetector.js    # M5 — AI-5 (E)
        ├── jobs/
        │   ├── yearEndJob.js             # M5 — node-cron (UC-04)
        │   └── reportScheduleJob.js      # M5 — node-cron (UC-30, E)
        └── db/
            ├── schema.sql                # M1
            ├── migrations/               # M1
            └── seeds/
                ├── seedPolicies.js       # M1/M5 — 10 countries
                ├── seedLeaveTypes.js     # M5
                ├── seedWeekendConfig.js  # M4 — UC-29, defaults Sat-Sun
                └── seedHolidays2026.js   # M4 — from provided Excel
```

### Environment Variables (`backend/.env.example`)

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/lms
JWT_SECRET=replace_me
JWT_EXPIRES_IN=8h
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.test
SMTP_PASS=your-app-password
FILE_STORAGE_DIR=./storage/attachments
MAX_UPLOAD_MB=10
LLM_PROVIDER=anthropic
LLM_API_KEY=replace_me
LLM_MODEL=claude-sonnet-4-6
TZ=Asia/Singapore
```

---

## 4. Permitted Dependencies

Only the packages below are permitted. Adding anything outside this list requires team agreement.

### Frontend (`frontend/package.json`)

| Package | Purpose |
|---------|---------|
| react, react-dom | UI library |
| react-router-dom | Routing + protected routes |
| axios | HTTP client |
| tailwindcss, postcss, autoprefixer | Styling |
| @fullcalendar/react, @fullcalendar/daygrid | Calendar & team views |
| recharts | Dashboard / report charts |
| react-i18next, i18next | Multi-language UI (E) |
| date-fns | Date handling |
| lucide-react | Icons |
| vite | Build tool |

### Backend (`backend/package.json`)

| Package | Purpose |
|---------|---------|
| express | HTTP server & routing |
| pg | PostgreSQL client |
| jsonwebtoken | JWT auth |
| bcrypt | Password hashing |
| zod | Request validation |
| node-cron | Year-end scheduled job |
| nodemailer | Email notifications |
| multer | Medical-certificate uploads (E) |
| ics | Calendar `.ics` export (E) |
| dotenv | Environment config |
| cors | Cross-origin for the SPA |
| @anthropic-ai/sdk *(or openai / @google/genai)* | LLM provider SDK — one, chosen by config |

---

## 5. Database Schema

Twenty-three tables (14 from the original core design + 9 added for onboarding, security, announcements, leave swap, comment threads, weekend configuration, and scheduled reports). Types, keys, and constraints are explicit; value sets from the source are enforced with `CHECK` constraints rather than database ENUM types (portable and migration-ready). The ER diagram is split into two views for legibility — `users` anchors both.

### 5.1 Entity-Relationship Diagrams

**Leave, Coverage & Calendar** — the day-to-day leave lifecycle.

```mermaid
erDiagram
    users ||--o{ leave_requests : submits
    users ||--o{ leave_balances : has
    leave_types ||--o{ leave_requests : classifies
    leave_policies ||--o{ leave_balances : governs
    leave_requests ||--o{ attachments : has
    leave_requests ||--o{ request_comments : discusses
    leave_requests ||--o{ leave_swap_requests : proposes

    users {
        int id PK
        varchar name
        varchar email UK
        char country
        varchar role
        int supervisor_id FK
        int manager_id FK
        int hod_id FK
        varchar locale
        boolean active
        varchar invitation_status
    }
    leave_types {
        varchar code PK
        varchar name
        boolean affects_annual_balance
        boolean affects_sick_balance
        boolean requires_mc_flag
        boolean active
    }
    leave_policies {
        char country PK
        int annual_min
        int annual_max
        int sick_with_mc
        int sick_no_mc
        int carry_forward_max
    }
    country_working_days {
        char country PK
        jsonb working_days_json
    }
    leave_balances {
        int id PK
        int user_id FK
        int year
        decimal annual_entitlement
        decimal annual_balance
        decimal sick_balance
        decimal carried_forward
    }
    leave_requests {
        int id PK
        int user_id FK
        varchar type_code FK
        date start_date
        date end_date
        boolean half_day_flag
        varchar half_day_period
        decimal computed_days
        boolean is_draft
        varchar status
        int supervisor_id FK
        varchar supervisor_status
        int manager_id FK
        varchar manager_status
        boolean special_approval_flag
        text approver_comment
        text ai_summary
        timestamp submitted_at
        timestamp decided_at
    }
    leave_swap_requests {
        int id PK
        int proposer_request_id FK
        int counterpart_request_id FK
        int proposer_user_id FK
        int counterpart_user_id FK
        varchar status
        timestamp expires_at
    }
    request_comments {
        int id PK
        int leave_request_id FK
        int author_user_id FK
        text body
        timestamp created_at
    }
    attachments {
        int id PK
        int leave_request_id FK
        varchar file_name
        varchar file_type
        varchar storage_url
        int uploaded_by FK
        timestamp uploaded_at
    }
    public_holidays {
        int id PK
        date holiday_date
        char country_code
        varchar holiday_name
        varchar source
        boolean active
    }
    blackout_periods {
        int id PK
        varchar scope
        varchar scope_id
        date start_date
        date end_date
        varchar mode
        varchar reason
    }
    min_staffing {
        int id PK
        varchar scope
        varchar scope_id
        int min_headcount
        varchar critical_roles
    }
```

**Platform, Identity & Admin** — auth, onboarding, security, announcements, delegation, notifications, reporting, and audit.

```mermaid
erDiagram
    users ||--o{ user_invitations : invites
    users ||--o{ user_sessions : opens
    users ||--o{ security_events : triggers
    users ||--o{ announcements : creates
    announcements ||--o{ announcement_acks : acknowledged_by
    users ||--o{ approval_delegations : delegates
    users ||--o{ notifications : receives
    users ||--o{ notification_preferences : sets
    users ||--o{ report_schedules : owns
    users ||--o{ audit_log : acts
    users ||--o{ ai_interactions : asks

    users {
        int id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar role
        boolean active
        varchar invitation_status
    }
    user_invitations {
        int id PK
        int invited_by FK
        varchar email
        varchar name
        char country
        varchar dept
        int supervisor_id FK
        int manager_id FK
        varchar token_hash
        timestamp expires_at
        timestamp accepted_at
    }
    user_sessions {
        int id PK
        int user_id FK
        varchar token_hash
        varchar device_info
        varchar ip_address
        timestamp last_active
        timestamp revoked_at
    }
    security_events {
        int id PK
        int user_id FK
        varchar event_type
        varchar ip_address
        boolean success_flag
        timestamp created_at
    }
    announcements {
        int id PK
        varchar title
        text body
        varchar target_type
        varchar target_id
        date start_date
        date end_date
        boolean requires_ack
        int created_by FK
    }
    announcement_acks {
        int announcement_id FK
        int user_id FK
        timestamp acked_at
    }
    approval_delegations {
        int id PK
        int from_user_id FK
        int to_user_id FK
        date start_date
        date end_date
        varchar reason
        boolean active
    }
    notifications {
        int id PK
        int user_id FK
        varchar type
        varchar message
        boolean read_flag
        timestamp created_at
    }
    notification_preferences {
        int id PK
        int user_id FK
        varchar event_type
        boolean email_flag
        boolean inapp_flag
    }
    report_schedules {
        int id PK
        int owner_user_id FK
        varchar report_type
        varchar frequency
        varchar delivery_day
        varchar format
        jsonb recipients_json
        boolean active
        timestamp last_run_at
    }
    audit_log {
        int id PK
        varchar action
        int user_id FK
        varchar entity
        int entity_id
        jsonb before
        jsonb after
        timestamp timestamp
    }
    ai_interactions {
        int id PK
        int user_id FK
        varchar feature
        text prompt
        varchar matched_template
        text response
        int tokens_used
        timestamp created_at
    }
```

### 5.2 SQL Table Definitions

```sql
CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    email          VARCHAR(180) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    country        CHAR(2) NOT NULL,
    role           VARCHAR(20) NOT NULL
                     CHECK (role IN ('EMPLOYEE','SUPERVISOR','MANAGER','HOD','HR_ADMIN')),
    supervisor_id  INT REFERENCES users(id),
    manager_id     INT REFERENCES users(id),
    hod_id         INT REFERENCES users(id),
    dept           VARCHAR(80),
    locale         VARCHAR(10) NOT NULL DEFAULT 'en',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    invitation_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                     CHECK (invitation_status IN ('INVITED','ACTIVE','DEACTIVATED')),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE leave_types (
    code                    VARCHAR(20) PRIMARY KEY,
    name                    VARCHAR(60) NOT NULL,
    affects_annual_balance  BOOLEAN NOT NULL DEFAULT FALSE,
    affects_sick_balance    BOOLEAN NOT NULL DEFAULT FALSE,
    requires_mc_flag        BOOLEAN NOT NULL DEFAULT FALSE,
    active                  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE leave_policies (
    country            CHAR(2) PRIMARY KEY,
    annual_min         INT NOT NULL,
    annual_max         INT NOT NULL,
    sick_with_mc       INT NOT NULL,
    sick_no_mc         INT NOT NULL,
    carry_forward_max  INT NOT NULL DEFAULT 5
);

CREATE TABLE country_working_days (
    country            CHAR(2) PRIMARY KEY,
    working_days_json  JSONB NOT NULL DEFAULT
        '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'
);

CREATE TABLE leave_balances (
    id                  SERIAL PRIMARY KEY,
    user_id             INT NOT NULL REFERENCES users(id),
    year                INT NOT NULL,
    annual_entitlement  NUMERIC(4,1) NOT NULL,
    annual_balance      NUMERIC(4,1) NOT NULL,
    sick_balance        NUMERIC(4,1) NOT NULL,
    carried_forward     NUMERIC(4,1) NOT NULL DEFAULT 0,
    UNIQUE (user_id, year)
);

CREATE TABLE leave_requests (
    id                     SERIAL PRIMARY KEY,
    user_id                INT NOT NULL REFERENCES users(id),
    type_code              VARCHAR(20) NOT NULL REFERENCES leave_types(code),
    start_date             DATE NOT NULL,
    end_date               DATE NOT NULL,
    half_day_flag          BOOLEAN NOT NULL DEFAULT FALSE,
    half_day_period        VARCHAR(2) CHECK (half_day_period IN ('AM','PM')),
    computed_days          NUMERIC(4,1) NOT NULL,
    is_draft               BOOLEAN NOT NULL DEFAULT FALSE,
    status                 VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('DRAFT','PENDING','SUPERVISOR_APPROVED',
                                               'APPROVED','REJECTED','CANCEL_PENDING','CANCELLED')),
    supervisor_id          INT REFERENCES users(id),
    supervisor_status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    manager_id             INT REFERENCES users(id),
    manager_status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    special_approval_flag  BOOLEAN NOT NULL DEFAULT FALSE,
    approver_comment       TEXT,
    ai_summary             TEXT,
    submitted_at           TIMESTAMP,
    decided_at             TIMESTAMP,
    created_at             TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_date_order   CHECK (end_date >= start_date),
    CONSTRAINT chk_half_day_one CHECK (half_day_flag = FALSE OR start_date = end_date)
);

CREATE TABLE attachments (
    id                SERIAL PRIMARY KEY,
    leave_request_id  INT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    file_name         VARCHAR(255) NOT NULL,
    file_type         VARCHAR(40) NOT NULL,
    storage_url       VARCHAR(500) NOT NULL,
    uploaded_by       INT NOT NULL REFERENCES users(id),
    uploaded_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE leave_swap_requests (
    id                       SERIAL PRIMARY KEY,
    proposer_request_id     INT NOT NULL REFERENCES leave_requests(id),
    counterpart_request_id  INT NOT NULL REFERENCES leave_requests(id),
    proposer_user_id        INT NOT NULL REFERENCES users(id),
    counterpart_user_id     INT NOT NULL REFERENCES users(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'PENDING_ACCEPT'
                              CHECK (status IN ('PENDING_ACCEPT','ACCEPTED','PENDING_APPROVAL',
                                                'APPROVED','REJECTED','EXPIRED')),
    expires_at              TIMESTAMP NOT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_swap_diff_users CHECK (proposer_user_id <> counterpart_user_id)
);

CREATE TABLE request_comments (
    id                 SERIAL PRIMARY KEY,
    leave_request_id   INT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    author_user_id     INT NOT NULL REFERENCES users(id),
    body               TEXT NOT NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT now()
    -- append-only: no UPDATE or DELETE permitted at the application layer
);

CREATE TABLE approval_delegations (
    id            SERIAL PRIMARY KEY,
    from_user_id  INT NOT NULL REFERENCES users(id),
    to_user_id    INT NOT NULL REFERENCES users(id),
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    reason        VARCHAR(255),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_deleg_dates CHECK (end_date >= start_date)
);

CREATE TABLE blackout_periods (
    id          SERIAL PRIMARY KEY,
    scope       VARCHAR(10) NOT NULL CHECK (scope IN ('COUNTRY','TEAM')),
    scope_id    VARCHAR(40) NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    mode        VARCHAR(20) NOT NULL CHECK (mode IN ('BLOCK','SPECIAL_APPROVAL')),
    reason      VARCHAR(255)
);

CREATE TABLE min_staffing (
    id             SERIAL PRIMARY KEY,
    scope          VARCHAR(10) NOT NULL CHECK (scope IN ('COUNTRY','TEAM')),
    scope_id       VARCHAR(40) NOT NULL,
    min_headcount  INT NOT NULL,
    critical_roles VARCHAR(255)
);

CREATE TABLE public_holidays (
    id            SERIAL PRIMARY KEY,
    holiday_date  DATE NOT NULL,
    country_code  CHAR(2) NOT NULL,
    holiday_name  VARCHAR(120) NOT NULL,
    source        VARCHAR(10) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','IMPORTED')),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (holiday_date, country_code)
);

CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    type        VARCHAR(40) NOT NULL,
    message     VARCHAR(500) NOT NULL,
    read_flag   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    event_type  VARCHAR(40) NOT NULL,
    email_flag  BOOLEAN NOT NULL DEFAULT TRUE,
    inapp_flag  BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (user_id, event_type)
);

CREATE TABLE user_invitations (
    id             SERIAL PRIMARY KEY,
    invited_by     INT NOT NULL REFERENCES users(id),
    email          VARCHAR(180) NOT NULL,
    name           VARCHAR(120) NOT NULL,
    country        CHAR(2) NOT NULL,
    dept           VARCHAR(80),
    supervisor_id  INT REFERENCES users(id),
    manager_id     INT REFERENCES users(id),
    token_hash     VARCHAR(255) NOT NULL UNIQUE,
    expires_at     TIMESTAMP NOT NULL,
    accepted_at    TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id),
    token_hash   VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    ip_address  VARCHAR(45),
    last_active TIMESTAMP NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE security_events (
    id            SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id),
    event_type    VARCHAR(20) NOT NULL
                    CHECK (event_type IN ('LOGIN','LOGOUT','FAILED_LOGIN','PASSWORD_CHANGE','SESSION_REVOKED')),
    ip_address    VARCHAR(45),
    success_flag  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE announcements (
    id            SERIAL PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    body          TEXT NOT NULL,
    target_type   VARCHAR(10) NOT NULL CHECK (target_type IN ('ALL','COUNTRY','ROLE')),
    target_id     VARCHAR(40),
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    requires_ack  BOOLEAN NOT NULL DEFAULT FALSE,
    created_by    INT NOT NULL REFERENCES users(id),
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_announce_dates CHECK (end_date >= start_date)
);

CREATE TABLE announcement_acks (
    announcement_id  INT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id          INT NOT NULL REFERENCES users(id),
    acked_at         TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE report_schedules (
    id                SERIAL PRIMARY KEY,
    owner_user_id     INT NOT NULL REFERENCES users(id),
    report_type       VARCHAR(60) NOT NULL,
    frequency         VARCHAR(10) NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY')),
    delivery_day      VARCHAR(20) NOT NULL,
    format            VARCHAR(10) NOT NULL CHECK (format IN ('EXCEL','PDF')),
    recipients_json   JSONB NOT NULL,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at       TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id         SERIAL PRIMARY KEY,
    action     VARCHAR(60) NOT NULL,
    user_id    INT REFERENCES users(id),
    entity     VARCHAR(40) NOT NULL,
    entity_id  INT,
    before     JSONB,
    after      JSONB,
    timestamp  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ai_interactions (
    id                SERIAL PRIMARY KEY,
    user_id           INT REFERENCES users(id),
    feature           VARCHAR(20) NOT NULL,
    prompt            TEXT,
    matched_template  VARCHAR(80),
    response          TEXT,
    tokens_used       INT,
    created_at        TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes for common access paths
CREATE INDEX idx_requests_user     ON leave_requests(user_id);
CREATE INDEX idx_requests_status   ON leave_requests(status);
CREATE INDEX idx_requests_dates    ON leave_requests(start_date, end_date);
CREATE INDEX idx_requests_sup      ON leave_requests(supervisor_id);
CREATE INDEX idx_requests_mgr      ON leave_requests(manager_id);
CREATE INDEX idx_holidays_country  ON public_holidays(country_code, holiday_date);
CREATE INDEX idx_notif_user        ON notifications(user_id, read_flag);
CREATE INDEX idx_balances_user     ON leave_balances(user_id, year);
CREATE INDEX idx_audit_entity      ON audit_log(entity, entity_id);
CREATE INDEX idx_attach_request    ON attachments(leave_request_id);
CREATE INDEX idx_ai_user           ON ai_interactions(user_id, feature);
CREATE INDEX idx_invitations_email ON user_invitations(email);
CREATE INDEX idx_sessions_user     ON user_sessions(user_id, revoked_at);
CREATE INDEX idx_security_user     ON security_events(user_id, event_type);
CREATE INDEX idx_announce_window   ON announcements(start_date, end_date);
CREATE INDEX idx_comments_request  ON request_comments(leave_request_id);
CREATE INDEX idx_swap_proposer     ON leave_swap_requests(proposer_user_id);
CREATE INDEX idx_swap_counterpart  ON leave_swap_requests(counterpart_user_id);
CREATE INDEX idx_schedules_owner   ON report_schedules(owner_user_id, active);
```

### 5.3 Seed Data

**Country policies** (`carry_forward_max = 5` for all; `annual_entitlement` per employee is set within `[annual_min, annual_max]`).

```sql
-- country, annual_min, annual_max, sick_with_mc, sick_no_mc, carry_forward_max
INSERT INTO leave_policies VALUES
 ('SG', 14, 24, 12, 2, 5),   -- Singapore HQ: 14 min, 24 max
 ('TH',  8, 11, 30, 0, 5),   -- Thailand: 8 annual + 3 business (=11); sick 30
 ('CN', 12, 14, 12, 2, 5),
 ('ID', 12, 14, 12, 2, 5),
 ('JP', 12, 14, 12, 2, 5),
 ('MY', 12, 14, 12, 2, 5),
 ('MM', 12, 14, 12, 2, 5),
 ('NZ', 12, 14, 12, 2, 5),
 ('PH', 12, 14, 12, 2, 5),
 ('VN', 12, 14, 12, 2, 5);
```

**Leave types** (only the value set defined in the source; `active` controls availability).

```sql
-- code, name, affects_annual, affects_sick, requires_mc, active
INSERT INTO leave_types VALUES
 ('ANNUAL',        'Annual Leave',        TRUE,  FALSE, FALSE, TRUE),
 ('SICK_MC',       'Sick Leave (with MC)', FALSE, TRUE,  TRUE,  TRUE),
 ('SICK_NO_MC',    'Sick Leave (no MC)',   FALSE, TRUE,  FALSE, TRUE),
 ('UNPAID',        'Unpaid Leave',         FALSE, FALSE, FALSE, TRUE),
 ('MATERNITY',     'Maternity Leave',      FALSE, FALSE, FALSE, TRUE),
 ('CHILDCARE',     'Childcare Leave',      FALSE, FALSE, FALSE, TRUE),
 ('COMPASSIONATE', 'Compassionate Leave',  FALSE, FALSE, FALSE, TRUE),
 ('OTHER',         'Other',                FALSE, FALSE, FALSE, TRUE);
```

**Public holidays** — loaded for 2026 from the provided Excel by `seedHolidays2026.js`; Thailand rows use `active` to express its configured subset.

**Weekend configuration** (UC-29) — default Saturday–Sunday for all ten countries; HR adjusts only where the company operates differently (e.g., a Friday–Saturday weekend market).

```sql
-- country, working_days_json
INSERT INTO country_working_days (country, working_days_json) VALUES
 ('SG', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('TH', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('CN', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('ID', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('JP', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('MY', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('MM', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('NZ', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('PH', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'),
 ('VN', '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}');
```

---

## 6. API Specification

REST over JSON. All responses use one envelope. Authenticated routes require `Authorization: Bearer <jwt>`.

### 6.1 Conventions & Error Schema

Success:

```json
{ "success": true, "data": { } }
```

Error (HTTP status set accordingly):

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "end_date must be on or after start_date" } }
```

| HTTP | code | Meaning |
|------|------|---------|
| 400 | VALIDATION_ERROR | Bad or missing input |
| 401 | UNAUTHORIZED | Missing/invalid JWT |
| 403 | FORBIDDEN | Role lacks permission |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Illegal state transition (e.g., approving a cancelled request) |
| 413 | PAYLOAD_TOO_LARGE | Upload exceeds size limit |
| 500 | SERVER_ERROR | Unhandled server error |

### 6.2 Auth & Identity (M1)

**`POST /api/auth/login`** — Public.

Request:

```json
{ "email": "alice@company.com", "password": "SecurePass123" }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1, "name": "Alice Tan", "email": "alice@company.com",
      "role": "EMPLOYEE", "country": "SG", "dept": "Finance",
      "locale": "en", "supervisor_id": 5, "manager_id": 8, "hod_id": 12
    }
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`.

Other identity endpoints (concise contracts):

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/auth/me` | All auth | Return current user from token |
| `POST /api/auth/forgot-password` | Public | Send reset email (standard flow) |
| `PUT /api/profile` | All auth | Edit own contact details (country/reporting lines read-only) |
| `PUT /api/profile/password` | All auth | Change password (bcrypt) |
| `GET /api/preferences` | All auth | List notification preferences |
| `PUT /api/preferences` | All auth | Update per-event email/in-app flags |
| `POST /api/admin/entitlements/bulk` | HR Admin | Bulk assign/adjust entitlements with new-joiner pro-ration; preview then commit (E) |

**Invitation & onboarding (UC-24).**

**`POST /api/admin/invitations`** — HR Admin. Creates a single-use, 48-hour invitation.

Request:

```json
{ "name": "Bao Wen", "email": "bao.wen@company.com", "country": "SG", "dept": "Engineering", "supervisor_id": 5, "manager_id": 8 }
```

Response `201`:

```json
{ "success": true, "data": { "id": 12, "email": "bao.wen@company.com", "expires_at": "2026-07-14T09:00:00+08:00" } }
```

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `POST /api/admin/invitations/:id/resend` | HR Admin | Resend / regenerate an expired or lost invitation |
| `GET /api/auth/invitations/:token` | Public | Validate a registration token before rendering the form |
| `POST /api/auth/register` | Public | Complete registration (password + confirm) using a valid token; activates the account and triggers pro-ration (UC-20) |

**Session management & security log (UC-25).**

**`GET /api/sessions`** — All authenticated (own).

Response `200`:

```json
{
  "success": true,
  "data": [
    { "id": 301, "device_info": "Chrome on macOS", "ip_address": "203.0.113.4", "last_active": "2026-07-12T08:40:00+08:00", "current": true },
    { "id": 298, "device_info": "Safari on iPhone", "ip_address": "203.0.113.9", "last_active": "2026-07-11T18:05:00+08:00", "current": false }
  ]
}
```

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `DELETE /api/sessions/:id` | Owner | Revoke a session (forces logout there only) |
| `GET /api/sessions/security-log` | All auth | Own login/logout/failed-attempt/password-change history (1 year) |
| `GET /api/admin/users/:id/sessions` | HR Admin | View a user's sessions (offboarding) |
| `DELETE /api/admin/users/:id/sessions` | HR Admin | Force-logout all of a user's sessions |
| `POST /api/admin/users/:id/unlock` | HR Admin | Clear a 15-minute lockout early |

**System announcements (UC-26).**

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/announcements/active` | All auth | Announcements targeted at the current user within their display window |
| `POST /api/announcements/:id/ack` | All auth | Acknowledge a mandatory-acknowledge announcement |
| `POST /api/admin/announcements` | HR Admin | Create (title, body, target_type/target_id, window, requires_ack) (E) |
| `GET /api/admin/announcements/:id/acks` | HR Admin | Read/acknowledge count for an announcement (E) |

### 6.3 Leave Requests (M2)

**`POST /api/leave`** — All authenticated (own leave). Submits or, with `is_draft:true`, saves a draft.

Request:

```json
{
  "type_code": "ANNUAL",
  "start_date": "2026-08-10",
  "end_date": "2026-08-11",
  "half_day_flag": false,
  "half_day_period": null,
  "reason": "Family trip",
  "is_draft": false
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "id": 501, "status": "PENDING", "computed_days": 2.0,
    "special_approval_flag": false, "awaiting_role": "SUPERVISOR"
  }
}
```

Errors: `400 VALIDATION_ERROR` (over balance, invalid dates, half-day spanning multiple days), `409 CONFLICT`.

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/leave` | All auth | Own requests (filter by status/year) |
| `GET /api/leave/:id` | Owner + approvers + HR | Single request detail |
| `PUT /api/leave/:id` | Owner (draft only) | Edit a draft |
| `POST /api/leave/:id/cancel` | Owner | Cancel (pending → immediate; approved → routes for approval) |
| `POST /api/leave/forecast` | All auth | Balance what-if without saving (E) |
| `GET /api/leave/:id/ics` | Owner | Download `.ics` for the approved leave (E) |

Sick leave (UC-05) is submitted via the same `POST /api/leave` with `type_code` set to `SICK_MC` or `SICK_NO_MC`; the MC-quota vs no-MC-quota check is applied automatically by `balanceService.js` from the employee's country policy.

**Leave swap (UC-27, E).**

**`POST /api/swaps`** — Owner of an approved leave request (proposer).

Request:

```json
{ "proposer_request_id": 501, "counterpart_user_id": 14, "counterpart_dates": { "start_date": "2026-08-17", "end_date": "2026-08-17" } }
```

Response `201`:

```json
{ "success": true, "data": { "id": 61, "status": "PENDING_ACCEPT", "expires_at": "2026-08-14T09:00:00+08:00" } }
```

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/swaps` | Proposer + counterpart | List own proposed/incoming swaps |
| `PUT /api/swaps/:id/accept` | Counterpart | Accept; routes both requests through the two-tier chain |
| `PUT /api/swaps/:id/decline` | Counterpart | Decline; original leave entries untouched |
| (approval) `PUT /api/approvals/:id/approve` | Supervisor/Manager | Same approval endpoint; on Manager final approval both `leave_requests` rows update atomically |

Errors: `400 VALIDATION_ERROR` (different Supervisor), `409 CONFLICT` (already responded / expired).

### 6.4 Approvals, Delegation & Bulk (M3)

**`PUT /api/approvals/:id/approve`** — Supervisor (step 1) or Manager (step 2).

Request:

```json
{ "comment": "Approved — coverage is fine." }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": 501, "status": "SUPERVISOR_APPROVED", "awaiting_role": "MANAGER",
    "balance_deducted": false
  }
}
```

On the Manager's final approval, `status` becomes `APPROVED` and `balance_deducted` becomes `true`. Errors: `403 FORBIDDEN`, `409 CONFLICT`.

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/approvals` | Supervisor/Manager | Role-scoped queue (`awaiting_role`, coverage count, `special_approval_flag`) |
| `GET /api/approvals/:id` | Supervisor/Manager | Detail incl. AI-3 summary card |
| `PUT /api/approvals/:id/reject` | Supervisor/Manager | Reject (comment mandatory) |
| `POST /api/approvals/bulk` | Supervisor/Manager | Approve/reject many at once; special-approval items excluded (E) |
| `GET /api/delegations` | Supervisor/Manager | List own delegations |
| `POST /api/delegations` | Supervisor/Manager | Nominate deputy + date range (deputy role ≥ own) (E) |
| `DELETE /api/delegations/:id` | Owner of delegation | End a delegation early (E) |

**Comment thread (UC-28).** Append-only; locked once the request reaches a final state.

**`POST /api/leave/:id/comments`** — Employee/Supervisor/Manager in the request's chain.

Request:

```json
{ "body": "Can you confirm you have a clinic letter for this?" }
```

Response `201`:

```json
{ "success": true, "data": { "id": 88, "author": { "id": 5, "name": "Priya Supervisor", "role": "SUPERVISOR" }, "created_at": "2026-07-12T09:15:00+08:00" } }
```

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/leave/:id/comments` | Chain participants + HR | List thread chronologically |

Errors: `409 CONFLICT` (request already decided/cancelled — thread is locked).

### 6.5 Calendar, Coverage & Holidays (M4)

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/calendar/team` | All auth (role-scoped) | Team leave events + country holidays |
| `GET /api/calendar/coverage?start=&end=` | All auth | On-duty headcount for a date range |
| `GET /api/holidays?country=SG` | All auth | Active holidays for a country |
| `POST /api/holidays/import` | HR Admin | CSV/feed import for a year |
| `GET /api/heatmap?team=&country=` | Supervisor+ | Daily headcount colour bands (E) |
| `GET /api/blackouts` / `POST /api/blackouts` | HR Admin/Manager | List / define restricted periods (E) |
| `GET /api/min-staffing` / `PUT /api/min-staffing` | HR Admin/Manager | Read / set minimum-staffing rules (E) |
| `GET /api/admin/weekend-config` | HR Admin | List each country's working-day configuration (UC-29) |
| `PUT /api/admin/weekend-config/:country` | HR Admin | Update a country's non-working days; ≥1 working day enforced; writes audit before/after |

**`GET /api/calendar/coverage`** response `200`:

```json
{
  "success": true,
  "data": {
    "range": { "start": "2026-08-10", "end": "2026-08-11" },
    "team_size": 3,
    "days": [
      { "date": "2026-08-10", "on_leave": 1, "on_duty": 2, "below_threshold": false },
      { "date": "2026-08-11", "on_leave": 2, "on_duty": 1, "below_threshold": true }
    ]
  }
}
```

### 6.6 Balances & Carry-Forward (M5)

**`GET /api/balance`** — All authenticated (own).

Response `200`:

```json
{
  "success": true,
  "data": {
    "year": 2026, "annual_entitlement": 18.0, "carried_forward": 5.0,
    "annual_used": 6.0, "annual_remaining": 17.0,
    "sick_with_mc_remaining": 12.0, "sick_no_mc_remaining": 2.0
  }
}
```

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `POST /api/admin/carry-forward/trigger` | HR Admin | Run the year-end routine manually (demo); returns processed/carried/forfeited |

### 6.7 Attachments — Medical Certificates (M2)

**`POST /api/leave/:id/attachments`** — Owner. `multipart/form-data`, field `file` (PDF/JPG/PNG, ≤ 10 MB).

Response `201`:

```json
{ "success": true, "data": { "id": 77, "file_name": "mc_2026-08-10.pdf", "file_type": "application/pdf" } }
```

Errors: `400 VALIDATION_ERROR` (unsupported type), `413 PAYLOAD_TOO_LARGE`.

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/attachments/:id` | Owner + approvers + HR only | Stream the file (access-controlled) |

### 6.8 Notifications (M3)

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/notifications` | All auth | Own notifications (unread first) |
| `PUT /api/notifications/:id/read` | Owner | Mark one read |
| `PUT /api/notifications/read-all` | Owner | Mark all read |

### 6.9 HR Admin, Reporting & Audit (M5)

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET/POST/PUT /api/admin/employees` | HR Admin | Add/edit/deactivate + reporting lines |
| `POST /api/admin/employees/import` | HR Admin | CSV staff import (row-level errors) |
| `GET/PUT /api/admin/policies` | HR Admin | Per-country policy config |
| `GET/POST/PUT /api/admin/leave-types` | HR Admin | Leave-type configuration |
| `GET /api/admin/reports/:type` | HR/Manager/HOD (scoped) | Utilisation / carry-forward / sick trend / overlap; `?format=csv\|xlsx\|pdf` |
| `GET /api/admin/audit` | HR Admin | Searchable, filterable audit log (read-only); export CSV/PDF |
| `GET /api/report-schedules` | HR Admin/HOD/Manager | List own scheduled report deliveries (E) |
| `POST /api/report-schedules` | HR Admin/HOD/Manager | Create a schedule (report type, frequency, day, format, recipients) (E) |
| `PUT /api/report-schedules/:id` | Owner | Pause/resume or edit a schedule (E) |
| `DELETE /api/report-schedules/:id` | Owner | Delete a schedule (E) |

### 6.10 AI Endpoints (all verticals)

**`POST /api/ai/parse-leave`** (AI-1) — All authenticated.

Request:

```json
{ "text": "I need next Monday off, then a half day on Friday for a clinic appointment" }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "parsed": [
      { "start_date": "2026-08-10", "end_date": "2026-08-10", "half_day_flag": false, "type_code": "ANNUAL" },
      { "start_date": "2026-08-14", "end_date": "2026-08-14", "half_day_flag": true, "half_day_period": "AM", "type_code": "SICK_NO_MC" }
    ],
    "confidence": 0.86, "needs_confirmation": true
  }
}
```

**`POST /api/ai/coverage`** (AI-2) — All authenticated.

Request:

```json
{ "start_date": "2026-08-10", "end_date": "2026-08-11", "team_id": "eng-sg" }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "impact": "Two of the three engineers in your team are already on leave on 11 Aug. Only one person would be on duty.",
    "suggested_alternative": { "start_date": "2026-08-17", "end_date": "2026-08-18" },
    "below_threshold": true
  }
}
```

**`POST /api/ai/insights`** (AI-4) — HR Admin / Manager / HOD.

Request:

```json
{ "question": "Which country had the highest annual leave usage in Q2?" }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "matched_template": "leave_usage_by_country",
    "params": { "quarter": "2026-Q2", "leave_type": "ANNUAL" },
    "answer": "Singapore had the highest annual-leave usage in Q2 2026 at 142 days, ahead of Thailand (98).",
    "chart": { "type": "bar", "x": ["SG","TH","MY","VN"], "y": [142, 98, 61, 55] }
  }
}
```

If no template matches, `matched_template` is `null` and `answer` points to the closest available reports.

| Method & path | Roles | Purpose |
|---------------|-------|---------|
| `GET /api/ai/approval-summary/:requestId` | Supervisor/Manager | AI-3 card (pattern, coverage, recommendation); also inlined in `GET /api/approvals/:id` |
| `GET /api/ai/anomalies` | HR Admin | AI-5 risk flags for the HR dashboard (E) |

---

## 7. Role × Endpoint Access Matrix

Legend: ✅ allowed · ❌ denied · scope notes where visibility is limited. Enforced by `rbacMiddleware` (Section 9).

| Endpoint group | Employee | Supervisor | Manager | HOD | HR Admin |
|----------------|:--------:|:----------:|:-------:|:---:|:--------:|
| Auth / profile / preferences | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own |
| Apply / draft / cancel leave | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own leave & balance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave swap propose/accept (E) | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own |
| Comment thread — post/view | ✅ own request | ✅ their reports | ✅ their groups | ❌ | ✅ (audit) |
| Session management (own) / security log | ✅ own | ✅ own | ✅ own | ✅ own | ✅ own |
| Force-logout & unlock (any user) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Announcements — view/ack | ✅ | ✅ | ✅ | ✅ | ✅ |
| Announcements — create/manage (E) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Send invitations / onboarding (UC-24) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Team calendar / coverage | Dates only | Direct reports | All groups under | All groups under | All |
| Approvals queue & approve/reject | ❌ | Direct reports | All groups under | ❌ | ❌ |
| Bulk approval / delegation | ❌ | ✅ (E) | ✅ (E) | ❌ | ❌ |
| Manpower heatmap | ❌ | Own teams | All groups | All groups | All |
| Blackout / min-staffing / weekend config | ❌ | ✅ (own teams, blackout) | ✅ (blackout) | ❌ | ✅ (all) |
| MC attachment (view) | Own | Their reports | Their groups | Their groups | All |
| Employee / policy / leave-type admin | ❌ | ❌ | ❌ | ❌ | ✅ |
| Carry-forward / bulk entitlement | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reports & exports | ❌ | Own teams | All groups | All groups | All |
| Scheduled report delivery (E) | ❌ | ❌ | ✅ own | ✅ own | ✅ own |
| Audit-trail viewer | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI-1 parse / AI-2 coverage | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI-3 approval summary | ❌ | ✅ | ✅ | ❌ | ❌ |
| AI-4 chatbot | ❌ | ✅ scoped | ✅ scoped | ✅ scoped | ✅ |
| AI-5 anomaly flags | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 8. AI Layer Design & Safety

All five features route through one backend **AI Service** (`services/ai/*`) so behaviour, logging, and provider choice are consistent.

**Provider adapter (`llmClient.js`).** A thin wrapper exposes a single `complete({ system, input, schema })` call. The concrete provider (Claude / GPT / Gemini) is selected by `LLM_PROVIDER` in the environment, so the team can switch vendors without touching feature code.

**AI-1 — Natural-language leave entry.** Free text → structured fields. The LLM returns JSON matching the apply-leave schema; the employee always confirms before submission. Parsing failures fall back to the manual form.

**AI-2 — Coverage analyzer.** Given the requested dates and the team's approved leave (counts only, no names sent to the LLM), it produces a human-readable impact statement and a suggested alternative range. The numeric threshold decision is computed in code; the LLM only phrases the explanation.

**AI-3 — Approval assistant.** For a pending request, the service assembles derived, non-identifying context (leave-pattern counts, headcount on the dates, historical comparison) and asks the LLM for a short summary and a recommended action (approve / approve-with-note / escalate). The result is cached in `leave_requests.ai_summary`. The approver always decides.

**AI-4 — HR insights chatbot.** The LLM's only job is to (a) classify the question against a **fixed catalogue** of parameterised queries in `queryCatalogue.js` (e.g., `leave_usage_by_country(quarter)`, `unused_balance_by_employee(threshold)`), and (b) extract parameters. The backend runs the matched query; **no free SQL is ever generated or executed.** If nothing matches, the bot returns the nearest available report rather than guessing.

**AI-5 — Anomaly & risk flags.** A lightweight, mostly rule-based pass surfaces at-risk-of-forfeiture balances, recurring coverage gaps, request clustering, and low-utilisation (burnout) signals as dashboard prompts. Flags are advisory — HR decides.

**Safety rules (apply to every feature):**

- No raw PII is sent to the LLM — only the minimum derived context per call.
- AI-4 uses a fixed query catalogue, never model-generated SQL (prevents prompt-injection and data-exfiltration).
- AI outputs are advisory: the two-tier approval, balance math, and coverage thresholds are always decided in code, not by the model.
- Every call is written to `ai_interactions` (feature, matched template, tokens) for audit, cost, and debugging.

---

## 9. Security & RBAC

**Authentication.** Email + password; passwords hashed with **bcrypt**. On login the API issues a signed **JWT** (`JWT_SECRET`, `JWT_EXPIRES_IN`) and records a `user_sessions` row (device info, IP, last-active). `authMiddleware` verifies the token and attaches `req.user`; a standard forgot-password email flow is available.

**Session management & lockout (UC-25).** Each active session is listed to its owner (device, browser, approximate location, last-active) and can be individually revoked, which immediately invalidates that session's token without affecting others. Every login, logout, failed attempt, and password change is written to `security_events` and retained for at least a year. **Three consecutive failed login attempts trigger a 15-minute lockout**; HR Admin can unlock early or force-logout any user's sessions (e.g., immediate offboarding).

**Onboarding security (UC-24).** New-employee invitations use a single-use, hashed token (`user_invitations.token_hash`) that expires after 48 hours; the account stays `INVITED` (inactive) until the token is redeemed via `POST /api/auth/register`. Expired or lost invitations are only resendable by HR Admin, never self-service.

**Authorisation.** Five roles — `EMPLOYEE`, `SUPERVISOR`, `MANAGER`, `HOD`, `HR_ADMIN`. `rbacMiddleware.requireRole(...roles)` guards every non-public route and returns `403` on mismatch. Data visibility follows the matrix in Section 7 and is scoped by reporting lines (`supervisor_id`, `manager_id`, `hod_id`).

**Document access.** Medical certificates are retrievable only by the request owner, that request's approvers, and HR — enforced server-side on `GET /api/attachments/:id`.

**Comment-thread integrity (UC-28).** `request_comments` is append-only at the application layer — no update or delete endpoint exists once a message is posted, and the thread itself locks (read-only) the moment its request reaches `APPROVED`, `REJECTED`, or `CANCELLED`.

**Auditing.** Every state-changing action (apply, approve, reject, cancel, delegate, swap, comment, invite, session-revoke, announcement, weekend-config change, config change) writes an `audit_log` row with actor, entity, timestamp, and before/after values. The audit view is read-only; rows cannot be edited or deleted, and history is retained for at least one year.

**Data protection & scope.** Only fields requiring protection are hashed (`password_hash`, invitation `token_hash`, session `token_hash` — all via bcrypt or an equivalent one-way hash). No sensitive PII leaves the system to the LLM (Section 8). Per the client, there are no cross-country staff transfers, so policy is fixed by the employee's `country`.

---

*End of High-Level Design*
