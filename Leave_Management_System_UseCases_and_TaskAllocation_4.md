# Annual Leave Management System — Use Cases & Team Task Allocation

**Challenge:** Singapore Chinese Chamber of Commerce and Industry (SCCCI) AI Challenge  
**Problem (2B):** Lack of any Annual Leave Tracking and Approval for Singapore (HQ) and other offices in Asia  
**Stack:** React.js (frontend) · Node.js (backend) · Relational Database · AI/LLM integration  
**Team Size:** 5

---

## 1. Project Summary

The company (Singapore HQ with approximately 60 staff across 10 Asian offices — China, Indonesia, Japan, Malaysia, Myanmar, New Zealand, Philippines, Singapore, Thailand, Vietnam) currently relies on Excel spreadsheets and an outdated SME Payroll system to manage annual leave. The result: leave approvals take "a week or more," supervisors lack visibility of who is covering whom, and employees often bypass supervisors and go directly to managers.

Our solution is a centralized, web-based, mobile-responsive Leave Management System enhanced with targeted AI capabilities that directly attack the slowness, visibility gaps, and manual overhead of the current process.

---

## 2. Pain Points → Solution Mapping

| Client Pain Point | Direct Solution |
|---|---|
| Approval takes a week or more | Two-tier digital workflow with mobile notifications + AI-assisted approval cards that reduce per-request decision time |
| Supervisor doesn't know who is taking leave | Real-time team calendar + AI-driven coverage warnings |
| Employees bypass supervisor and go to manager | Enforced routing: Supervisor must approve before Manager sees the request |
| Manual carry-forward every January | Scheduled batch job, 5-day cap, automatic balance reset |
| Different country policies | Per-country policy engine; configurable in HR Admin panel |
| Public holidays manually entered | Annual import (CSV/online calendar feed) per country |
| No mobile access | Responsive web design, all functions work on mobile browser |
| No real-time visibility | Live dashboards for HR, Manager, and HOD roles |

---

## 3. Feature Modules Overview

Core modules deliver the client's must-have outcomes. Enhanced modules add depth and polish. Every module maps to a single owner (see Section 6). Enhanced features are marked **(E)**.

| Module | Key Features | Owner | Priority |
|---|---|---|---|
| Access & Identity | Login, RBAC, invitation & onboarding, session management, security log, system announcements, self-service profile, multi-language UI | Member 1 | Core + Enhanced |
| Entitlement Management | Bulk yearly entitlement update, pro-ration for new joiners | Member 1 | Enhanced |
| Leave Requests | Apply (full/half-day AM-PM), drafts, cancellation, balance forecast, status tracker, leave swap request | Member 2 | Core + Enhanced |
| Sick Leave | Sick-leave quotas per country, MC vs no-MC tracking, document upload | Member 2 | Core + Enhanced |
| Approvals | Two-tier workflow, delegation / acting approver, bulk approval, comment threads, rejection reasons | Member 3 | Core + Enhanced |
| Notifications | Email + in-app, approval reminders, escalation prompts | Member 3 | Core |
| Calendars & Coverage | Team calendar, overlap detection, manpower heatmap, minimum-staffing rules, blackout periods, weekend config per country | Member 4 | Core + Enhanced |
| Holidays & Calculation | Per-country public holidays (import + online sync), working-day & holiday-aware leave calculation | Member 4 | Core + Enhanced |
| HR Administration | Employee & policy management, leave-type config, carry-forward batch job, audit-trail viewer | Member 5 | Core + Enhanced |
| Analytics & Reporting | Reporting suite with Excel/PDF export, scheduled report delivery, manpower dashboards | Member 5 | Enhanced |
| AI Layer | NL leave entry, coverage analyzer, approval assistant, HR insights chatbot, anomaly flags | All (see §4) | Enhanced |

---

## 4. AI Features (Differentiators for the Challenge)

Since this is an AI Challenge, the prototype includes five AI capabilities that solve real client pain points rather than being decorative.

### AI-1: Natural-Language Leave Application
Employees type a request in plain English (or local language) — *"I need next Monday off, then a half day on the following Friday for a clinic appointment"* — and the LLM parses it into structured fields: dates, half/full-day flag, leave type, and reason. The form is pre-filled and the employee confirms before submission. Reduces friction and mobile typing burden.

### AI-2: Smart Coverage Analyzer
When an overlap is detected, the AI explains *why* it matters in human-readable form: *"Two of the three engineers in your team are already on leave that week. Consider shifting to the following week, when only one is out."* It suggests the nearest alternative date range with full coverage.

### AI-3: Approval Assistant for Supervisors / Managers
Each pending request is augmented with an AI-generated summary card: employee's recent leave pattern, current team headcount on those dates, comparison to historical coverage, and a recommended action (approve / approve with note / escalate). The approver still decides — the AI only assists. This is the single largest lever for reducing the "week or more" approval time.

### AI-4: HR Insights Chatbot
HR Admin can ask questions in natural language — *"Which country had the highest sick leave usage last quarter?"*, *"Show me employees with more than 10 days of unused annual leave"* — and get instant answers with charts. Removes the need to manually run reports.

### AI-5: Anomaly & Risk Flags
A lightweight assistant surfaces patterns HR would otherwise miss: employees at risk of forfeiting leave before the year-end cap, teams with recurring coverage gaps, unusual clustering of requests around specific dates, and employees who rarely take leave (burnout risk). Flags appear on the HR dashboard as prompts, not automated actions — HR decides what to do.

> **Implementation note:** AI features are powered by a hosted LLM API (Claude, GPT, or Gemini — team decision) called from the Node.js backend. For AI-4, the chatbot maps user questions to a fixed catalogue of pre-defined parameterised queries rather than generating free SQL — this prevents prompt-injection and data-exfiltration risks. No sensitive PII is sent to the LLM; only the minimum context needed for each call is included.

---

## 5. Use Cases

### Actor Roles

| Role | Description |
|---|---|
| **Employee (Staff)** | Applies for and tracks own leave. Has exactly one Supervisor. |
| **Supervisor** | First-level approver for direct reports. |
| **Manager** | Second-level approver; also approves coverage exceptions. A Manager can oversee multiple Supervisors (per client). |
| **HOD (Head of Department)** | Oversight role; sees all groups under the department. |
| **HR Admin** | System administrator (Singapore HQ HR). |

---

### UC-01: Employee Applies for Leave (with optional AI input)

**Primary Actor:** Employee  
**Preconditions:** Logged in; has available leave balance

**Main Flow:**

1. Employee opens the team calendar view, which shows teammates' approved leave and the public holidays for the employee's country.
2. Employee either fills the form manually OR types a natural-language request (AI-1 parses it into structured fields).
3. Employee selects date range (full-day or half-day AM/PM) and leave type (Annual / Sick / Other).
4. System checks for overlap with same-team members' approved leave and calculates remaining team coverage on those dates.
5. **If team coverage stays at or above threshold** → request routes normally to Supervisor first, then Manager.
6. **If team coverage would drop below threshold** → AI-2 explains the impact and suggests alternative dates. Employee may amend the dates, or proceed with the request flagged as "requires Manager special approval."
7. Employee receives in-app confirmation of submission.

**Business Rules:**
- Half-day or full-day only — no hourly increments.
- Cannot apply for more days than the current balance.
- Leave type cannot be changed after submission (cancel and re-apply only).

---

### UC-02: Two-Tier Approval Workflow (with AI Assistant)

**Primary Actors:** Supervisor → Manager

**Main Flow:**

1. Supervisor receives a notification (in-app + email) of the pending request.
2. Supervisor opens the request and sees the AI-3 summary card (recent leave pattern, current team coverage, recommendation).
3. Supervisor reviews and approves or rejects.
4. If coverage is sufficient → Supervisor approves → request routes to Manager.
5. If coverage is insufficient → Supervisor flags as "requires special approval"; Manager must explicitly approve the coverage exception.
6. Manager makes the final decision with the same AI-3 card available.
7. Employee is notified of the outcome.
8. Leave balance is deducted **only** on final Manager approval.

**Business Rules:**
- Both Supervisor AND Manager must approve. No auto-approval.
- Supervisor cannot be bypassed — direct-to-manager submissions are not possible.
- A Manager may have multiple Supervisors reporting to them.
- Every action is recorded in the audit log.

---

### UC-03: Leave Cancellation Request

**Primary Actor:** Employee

**Main Flow:**

1. Employee opens an existing leave entry (pending or approved).
2. Selects "Request Cancellation". Leave type cannot be changed — only cancellation is allowed.
3. If still pending → cancelled immediately; balance untouched.
4. If already approved → cancellation routes through Supervisor → Manager again.
5. Upon cancellation approval, leave balance is restored.

---

### UC-04: Year-End Auto Carry-Forward

**Primary Actor:** System (scheduled batch job) / HR Admin

**Main Flow:**

1. On December 31st at 23:59 Singapore Time (SGT, UTC+8) — the HQ timezone — the system runs a scheduled job (node-cron).
2. For each employee, the system calculates unused annual leave.
3. Carries forward **up to a maximum of 5 days** into the new calendar year.
4. Excess unused leave is forfeited and logged for audit.
5. HR Admin receives a summary report of all carry-forward actions.
6. Annual leave entitlement is reset for the new year based on country policy.

**Country-Specific Annual Leave Entitlements:**

| Country | Annual Leave |
|---|---|
| Singapore | 14 minimum, 24 maximum |
| Thailand | 8 days annual + 3 business days |
| Other countries (CN, ID, JP, MY, MM, NZ, PH, VN) | 12 or 14 days |

---

### UC-05: Sick Leave Tracking

**Primary Actor:** Employee

**Main Flow:**

1. Employee submits a sick leave request (tracked separately from annual leave).
2. The system applies the country-specific quota:
   - **Thailand:** 30 days
   - **Other countries:** 12 days with medical certificate (MC) + 2 days without MC
3. The same two-tier approval flow applies (sick leave is typically submitted retroactively).

---

### UC-06: Public Holiday Auto-Import & Calendar Display

**Primary Actor:** System / HR Admin

**Main Flow:**

1. HR Admin imports public holidays per country at the start of each year (CSV upload or online calendar feed — 2026 data already in the provided Excel file).
2. The system displays country-specific holidays on each employee's calendar.
3. Public holidays are **not** deducted from leave balance when a leave period crosses them.
4. For Thailand, only a configurable subset of holidays apply per company policy.

---

### UC-07: Team Coverage / Overlap Detection (AI-Enhanced)

**Primary Actor:** Employee + Supervisor

**Main Flow:**

1. Before submission, the employee sees a calendar with teammates' approved leave dates.
2. A visual indicator (red/yellow) warns of overlapping leave.
3. AI-2 provides a plain-English explanation of the coverage impact and suggests alternative dates.
4. The Supervisor view shows daily headcount on duty per team.
5. If headcount falls below the configured threshold, the request is flagged as requiring Manager's special approval.

---

### UC-08: Role-Based Calendar & History View

**Primary Actor:** All roles

**Access Rules:**

| Role | Can View |
|---|---|
| Staff | Own leave history; team availability view (dates only) for overlap awareness |
| Supervisor | All staff directly under them |
| Manager | All groups and staff under them |
| HOD | All groups and staff under them |
| HR Admin | Everyone across all countries |

**Data retention:** 1 year of historical data accessible to users. HR can export full reports.

---

### UC-09: Mobile-Responsive Access

**Primary Actor:** All roles

**Main Flow:**
- All core functions (apply, approve, view calendar) work fluidly on mobile browsers.
- Responsive UX layout — no native app for prototype (per client guidance).
- Notifications delivered in-app + email; web push optional.

---

### UC-10: HR Admin — Employee & Policy Management

**Primary Actor:** HR Admin

**Functions:**
- Add, edit, deactivate employees
- Define reporting lines (Employee → Supervisor → Manager → HOD)
- Configure country-specific leave policies
- Import staff list via CSV
- View dashboard: pending approvals, leave usage by country/department
- Generate exportable reports (CSV / Excel)
- Ask the AI-4 HR Insights Chatbot for ad-hoc analytics

---

### UC-11: HR Insights Chatbot (AI-4)

**Primary Actor:** HR Admin / Manager / HOD

**Main Flow:**

1. User opens the chatbot panel in the dashboard.
2. Asks a question in natural language (e.g., *"Which country had the highest annual leave usage in Q2?"*).
3. The LLM classifies the question against a fixed catalogue of pre-defined parameterised queries (e.g., `leave_usage_by_country(quarter)`, `unused_balance_by_employee(threshold)`) and extracts the parameters. No free SQL is generated.
4. The matching query is executed by the backend; results are returned with a textual answer and a chart where appropriate.
5. If no template matches, the chatbot replies with the closest available reports rather than guessing.
6. The user can follow up conversationally.

---

### UC-12: Notifications

**Primary Actor:** System

**Triggers (in-app + email):**
- New leave request → Supervisor notified
- Supervisor action taken → Manager notified
- Final approval/rejection → Employee notified
- Reminder for pending approvals after 24 hours (reminder only — never auto-approves)
- Overlap warning shown to Employee at application time
- Year-end carry-forward summary sent to Employee + HR Admin

---

### UC-13: Attach Medical Certificate (MC) to Sick Leave

**Primary Actor:** Employee

**Main Flow:**

1. When applying for sick leave, the employee uploads a medical certificate or supporting document (PDF or image).
2. The system stores the file and links it to the request; the MC vs no-MC quota is applied automatically per country.
3. The approver and HR can view the attachment from the request detail; other staff cannot.

**Business Rules:**
- Accepted types PDF/JPG/PNG; size limit enforced (e.g., 10 MB).
- Only the request owner, their approvers, and HR may view the document.

---

### UC-14: Save Draft, Track Status & Export to Calendar

**Primary Actor:** Employee

**Main Flow:**

1. Employee can save an incomplete request as a draft and finish it later.
2. After submission, a status stepper shows progress through Supervisor → Manager with timestamps at each stage.
3. Employee can export approved leave to a calendar file (.ics) for Google Calendar or Outlook.

**Business Rules:**
- Drafts are private to the employee and never routed for approval until submitted.
- Withdrawing a pending request follows UC-03 (cancellation).

---

### UC-15: Approval Delegation / Acting Approver

**Primary Actor:** Supervisor / Manager

**Main Flow:**

1. An approver who will be away nominates a deputy and a date range for delegated authority.
2. During that window, incoming requests are routed to the deputy instead.
3. The delegation is recorded in the audit log; the original approver keeps visibility.
4. Delegation auto-expires at the end of the range.

**Business Rules:**
- The deputy must hold an equal or higher role.
- Delegation cannot collapse the two-tier requirement — both stages still occur.

---

### UC-16: Bulk Approval with Comments

**Primary Actor:** Supervisor / Manager

**Main Flow:**

1. Approver selects multiple pending requests from the queue.
2. Approver approves or rejects them in a single action and adds a comment.
3. Affected employees are notified, and the comment is attached to each decision.

**Business Rules:**
- A rejection comment is mandatory; an approval comment is optional.
- Requests flagged for special approval are excluded from bulk actions.

---

### UC-17: Manpower Heatmap & Coverage Dashboard

**Primary Actor:** Supervisor / Manager / HOD / HR Admin

**Main Flow:**

1. User opens a calendar heatmap showing daily on-duty headcount per team.
2. Days are colour-coded (green / amber / red) against the configured minimum-staffing level.
3. Clicking a day reveals who is on leave; results can be filtered by team and country.

**Business Rules:**
- Visibility follows the role rules in UC-08.

---

### UC-18: Blackout / Restricted Leave Periods

**Primary Actor:** HR Admin / Manager

**Main Flow:**

1. An authorised user defines date ranges when leave is restricted (e.g., year-end financial close, product launch).
2. These periods are shown on employee calendars.
3. A leave request that falls inside a blackout is either blocked or auto-flagged for Manager special approval, depending on the period's mode.

**Business Rules:**
- Blackout periods are configurable per team and per country.

---

### UC-19: Working-Day & Holiday-Aware Leave Calculation

**Primary Actor:** System

**Main Flow:**

1. When computing a request's duration, the system excludes weekends (per country config from UC-29) and the employee's country public holidays.
2. Half-days count as 0.5; the exact number of days to be deducted is shown to the employee before submission.
3. The same calculation is used on final approval, keeping balances correct.

**Business Rules:**
- Only holidays active for the employee's country apply (Thailand uses its configured subset).

---

### UC-20: Bulk Yearly Entitlement Update & Pro-Ration

**Primary Actor:** HR Admin

**Main Flow:**

1. At year start, HR bulk-assigns or adjusts entitlements for all employees according to country policy.
2. New joiners receive a pro-rated entitlement based on their start date.
3. HR previews the computed changes before committing; all changes are written to the audit log.

**Business Rules:**
- Runs alongside, but is distinct from, the automatic carry-forward job (UC-04).

---

### UC-21: Audit Trail Viewer

**Primary Actor:** HR Admin

**Main Flow:**

1. HR opens a searchable, filterable log of every application, approval, cancellation, delegation, and configuration change.
2. Each entry records the actor, timestamp, and before/after values.
3. HR can export the filtered view to CSV or PDF.

**Business Rules:**
- The audit view is read-only; entries cannot be edited or deleted.
- History is retained for at least 1 year.

---

### UC-22: Reporting Suite & Exports

**Primary Actor:** HR Admin / Manager / HOD

**Main Flow:**

1. User selects a report: leave utilisation by country/department/type, carry-forward summary, sick-leave trend, or overlap incidents.
2. The report renders as a chart and table.
3. The user exports it to Excel or PDF, or optionally schedules a recurring email delivery (UC-30).

**Business Rules:**
- Report scope respects each user's role visibility (UC-08).

---

### UC-23: Employee Self-Service & Preferences

**Primary Actor:** Employee (all roles)

**Main Flow:**

1. Employee views and edits their own profile (contact details; country and reporting lines are read-only).
2. Employee changes their password and sets notification preferences (email and/or in-app) per event type.
3. Employee selects a preferred UI language; dates and formats follow the chosen locale.

**Business Rules:**
- Reporting lines and entitlements can only be changed by HR (UC-10).
- Passwords are stored hashed (bcrypt); a standard forgot-password email flow is available.

---

### UC-24: New Employee Invitation & Onboarding Flow

**Primary Actor:** HR Admin (sends invite) / New Employee (completes registration)

**Main Flow:**

1. HR Admin enters the new employee's name, email, country, department, and reporting line, then sends an invitation.
2. The system generates a one-time registration link (expires in 48 hours) and emails it to the new employee.
3. The new employee clicks the link, sets a password, and is walked through a guided first-login tour: verify country, confirm reporting line, and set notification preferences.
4. On completion, the account is activated and the employee's leave entitlement is auto-computed from their start date (pro-rated, UC-20).
5. HR Admin is notified when the invitation is accepted.

**Business Rules:**
- Invitation links are single-use and expire after 48 hours; HR can resend.
- Accounts are inactive until the invitation is accepted.

---

### UC-25: Session Management & Security Log

**Primary Actor:** Employee (own sessions) / HR Admin (all users)

**Main Flow:**

1. Employee opens the security settings panel and sees a list of all active sessions: device type, browser, approximate location, and last active timestamp.
2. Employee can revoke any session they do not recognise (forces logout of that session immediately).
3. A personal security log shows every login, logout, failed attempt, and password change for the past year.
4. HR Admin can view and force-logout any user's sessions (e.g., for immediate offboarding).

**Business Rules:**
- Three consecutive failed login attempts trigger a 15-minute lockout; HR Admin can unlock early.
- Revoking a session does not affect other active sessions.

---

### UC-26: System Announcements & Maintenance Broadcasts

**Primary Actor:** HR Admin

**Main Flow:**

1. HR Admin composes an announcement with a title, body, target audience (all users, specific country, or specific role), and a display window (start date / end date).
2. The announcement appears as a banner or modal to targeted users when they next log in.
3. Announcements can be set as dismissible (user can close) or mandatory-acknowledge (user must tick a checkbox before continuing).
4. HR Admin can view a read/acknowledge count per announcement.

**Business Rules:**
- Announcements auto-expire at the configured end date.
- Mandatory-acknowledge announcements block navigation until confirmed.

---

### UC-27: Leave Swap Request

**Primary Actor:** Employee A (proposer) / Employee B (counterpart)

**Main Flow:**

1. Employee A selects one of their approved leave entries and proposes to swap dates with Employee B, specifying the dates they want to take in exchange.
2. Employee B receives an in-app notification and reviews the proposal; they can accept or decline.
3. If Employee B accepts, the system creates a paired swap request and routes it through the normal two-tier approval chain for both employees.
4. If the Manager approves, both leave entries are updated atomically — either both succeed or neither does.
5. Both employees are notified of the outcome and their balances remain unchanged (dates swap, not days).

**Business Rules:**
- Both employees must be in the same team (same Supervisor) for the swap to be valid.
- If the Manager rejects, both original leave entries remain unchanged.
- A swap proposal expires after 48 hours if Employee B does not respond.

---

### UC-28: Comment Thread & Discussion on Leave Requests

**Primary Actor:** Employee / Supervisor / Manager

**Main Flow:**

1. While a leave request is pending, any party in the chain can open a comment thread and post a message (e.g., *"Can you confirm you have a clinic letter for this?"*).
2. The other parties receive an in-app notification and email digest of new comments.
3. Replies are threaded chronologically and visible to all parties in the approval chain.
4. HR Admin can view all threads for audit purposes.
5. All comments are timestamped, attributed by name and role, and written to the audit log.

**Business Rules:**
- Comments are locked (read-only) once the request is approved, rejected, or cancelled.
- Comments cannot be edited or deleted after posting — append-only for audit integrity.

---

### UC-29: Country-Specific Weekend Configuration

**Primary Actor:** HR Admin

**Main Flow:**

1. HR Admin opens the country configuration panel and selects which days of the week are non-working (weekend) days for each country.
2. The configuration feeds directly into the working-day & holiday-aware leave calculation (UC-19), so duration is computed correctly per employee's country.
3. Any change to a country's weekend configuration is written to the audit log with a before/after snapshot.
4. Changes apply to new requests only; existing approved requests are not retroactively recalculated.

**Business Rules:**
- Default is Saturday–Sunday for all countries; HR adjusts only where different.
- At least one working day per week must remain; the system prevents a full-week configuration.

---

### UC-30: Scheduled & Automated Report Delivery

**Primary Actor:** HR Admin / HOD / Manager

**Main Flow:**

1. User selects any available report and configures a delivery schedule: frequency (weekly / monthly / quarterly), day of delivery, format (Excel or PDF), and recipient email list.
2. At the scheduled time, the system auto-generates the report scoped to the user's role visibility (UC-08) and emails it to the recipient list as an attachment.
3. The user can view, pause, or delete active schedules from a management screen.
4. Each delivery is logged for audit purposes.

**Business Rules:**
- Recipient list may include external email addresses (e.g., payroll provider).
- If report generation fails, the system retries once and notifies the schedule owner on second failure.

---

## 6. Task Allocation for 5-Person Team (Full-Stack Verticals)

Each member owns one unique role end-to-end — building both the frontend and the backend for their own area. Workload has been balanced to **6 use cases per member** (Member 2 carries 7 as the core employee flow is the system's most-used path). Enhanced features are marked **(E)** — build Core first and layer Enhanced in Phase 3.

### Workload Summary

| Member | Role | Use Cases | AI Feature | UC Count |
|---|---|---|---|---|
| Member 1 | Platform, Identity & Self-Service Engineer | UC-09, UC-20, UC-23, UC-24, UC-25, UC-26 | — | 6 |
| Member 2 | Employee Leave Experience Engineer | UC-01, UC-03, UC-05, UC-08 (staff), UC-13, UC-14, UC-27 | AI-1 | 7 |
| Member 3 | Approval, Delegation & Notification Engineer | UC-02, UC-08 (approver), UC-12, UC-15, UC-16, UC-28 | AI-3 | 6 |
| Member 4 | Coverage, Calendar & Scheduling-Rules Engineer | UC-06, UC-07, UC-17, UC-18, UC-19, UC-29 | AI-2 | 6 |
| Member 5 | HR Admin, Analytics & Automation Engineer | UC-04, UC-10, UC-11, UC-21, UC-22, UC-30 | AI-4, AI-5 | 6 |

---

### Member 1 — Platform, Identity & Self-Service Engineer
*Use cases: UC-09 · UC-20 · UC-23 · UC-24 · UC-25 · UC-26*

**Frontend:**
- Login / logout & forgot-password screens
- Role-based navigation shell & protected routing
- Shared UI component library + responsive layout framework (UC-09)
- Bulk yearly entitlement / pro-ration screen (UC-20)
- Employee self-service profile & password change (UC-23)
- Notification-preferences & locale switcher (UC-23, E)
- Invitation send form + new-employee registration & onboarding tour (UC-24)
- Session management panel + security log (UC-25)
- Announcement compose, targeting & scheduling screen (UC-26)
- Announcement banner / modal for all users (UC-26)

**Backend:**
- JWT authentication, sessions & bcrypt password hashing
- Role-based access control (RBAC) middleware
- Database schema ownership & migrations
- Deployment / CI setup & environment config
- Bulk entitlement update & pro-ration logic (UC-20)
- Profile & notification-preference APIs (UC-23)
- Internationalisation (i18n) resource backend (E)
- Invite token generation + expiry + registration API (UC-24)
- Session table, revoke endpoint & failed-login lockout (UC-25)
- Announcements table, targeting engine & acknowledgement API (UC-26)

---

### Member 2 — Employee Leave Experience Engineer
*Use cases: UC-01 · UC-03 · UC-05 · UC-08 (staff) · UC-13 · UC-14 · UC-27 · AI-1*

**Frontend:**
- Leave application form (full/half-day AM-PM) + employee dashboard
- Personal calendar & leave-history view (UC-08 staff view)
- Cancellation & draft-request UI (UC-03)
- Request status tracker — stepper with timestamps
- Sick leave application form with MC / no-MC toggle (UC-05)
- Medical-certificate upload UI (UC-13, E)
- Balance forecast / what-if & .ics calendar export (UC-14, E)
- Leave swap proposal & incoming swap inbox (UC-27, E)
- AI-1 natural-language input box

**Backend:**
- Leave request create / read / draft API (UC-01)
- Balance deduction & restoration logic
- Cancellation workflow (UC-03)
- Sick-leave quota logic — MC vs no-MC per country (UC-05)
- Document (MC) upload & secure storage service (UC-13, E)
- iCal (.ics) generation endpoint (UC-14, E)
- Swap request state machine + paired atomic balance update (UC-27, E)
- AI-1 NL parsing service (text → structured leave fields)

---

### Member 3 — Approval, Delegation & Notification Engineer
*Use cases: UC-02 · UC-08 (approver) · UC-12 · UC-15 · UC-16 · UC-28 · AI-3*

**Frontend:**
- Supervisor / Manager approval queue
- Approval detail view with AI-3 summary card + comment thread panel (UC-28)
- Bulk approve/reject with mandatory rejection comment (UC-16, E)
- Delegation / acting-approver setup screen (UC-15, E)
- Notification center with read/unread state
- Approver's team-schedule view (UC-08 approver view)
- Employee reply UI for comment thread (UC-28)

**Backend:**
- Two-tier routing state machine — enforced Supervisor → Manager (UC-02)
- Approve / reject + comment logic + audit-log writes
- Bulk-action endpoint (UC-16, E)
- Delegation engine with auto-expiry (UC-15, E)
- Notification service (email + in-app) + 24-hour reminder scheduler (UC-12)
- Comment thread API — append-only, locked on decision (UC-28)
- New-comment notification trigger (UC-28)
- AI-3 approval-summary generation

---

### Member 4 — Coverage, Calendar & Scheduling-Rules Engineer
*Use cases: UC-06 · UC-07 · UC-17 · UC-18 · UC-19 · UC-29 · AI-2*

**Frontend:**
- Team calendar with overlap highlights (UC-07)
- Coverage warning banners + AI-2 explanation panel
- Manpower heatmap — green/amber/red headcount view (UC-17, E)
- Blackout-period management screen (UC-18, E)
- Country-specific public-holiday display (UC-06)
- Weekend-configuration screen per country (UC-29)

**Backend:**
- Overlap detection & coverage-threshold engine (UC-07)
- Working-day & holiday-aware leave calculation — reads weekend config (UC-19)
- Country weekend-days config table + calculation update (UC-29)
- Country leave-policy engine (entitlements)
- Minimum-staffing & blackout-period rules (UC-17/18, E)
- Public-holiday import job + online-calendar sync (UC-06)
- AI-2 coverage-analyzer service

---

### Member 5 — HR Admin, Analytics & Automation Engineer
*Use cases: UC-04 · UC-10 · UC-11 · UC-21 · UC-22 · UC-30 · AI-4 · AI-5*

**Frontend:**
- HR admin panel — employee records, leave-type & policy config, CSV import (UC-10)
- HR dashboard with manpower charts + AI-5 anomaly flags (E)
- Audit-trail viewer — searchable, filterable, exportable (UC-21, E)
- Reporting suite with chart + table view (UC-22, E)
- Scheduled report delivery management screen (UC-30, E)
- AI-4 chatbot UI

**Backend:**
- Employee / policy / leave-type management API + CSV staff import (UC-10)
- Year-end carry-forward batch job — node-cron, SGT (UC-04)
- Reporting / analytics queries + Excel/PDF export generation (UC-22, E)
- Audit-trail query API — read-only (UC-21, E)
- Report-schedule table + cron-based auto-generation & email dispatch (UC-30, E)
- AI-4 query catalogue (parameterised, no free SQL)
- AI-5 anomaly detection — forfeiture risk, gap patterns, burnout flags (E)

---

### Cross-Cutting Notes

- **(E)** marks Enhanced features — build the Core of every vertical first, then layer Enhanced features in Phase 3.
- UC-08 (role-based views) is enforced centrally by Member 1's RBAC layer; each member renders their own persona's calendar and history within those permissions.
- UC-09 (mobile responsiveness): Member 1 provides the shared layout framework; every member makes their own screens responsive.
- The working-day & holiday-aware calculation (Member 4, UC-19) reads weekend config (UC-29) and is the single source of truth for leave duration — Members 2 and 5 call it via a shared service rather than reimplementing it.
- Country leave-policy rules (Member 4) feed the carry-forward and sick-leave logic (Members 5 and 2 respectively) — agree the policy data contract early.
- The team-calendar component (Member 4) is reused by the employee view (Member 2) and the approver view (Member 3) — expose it as a shared component with a clear props/API contract.
- Notification preferences (Member 1, UC-23) are read by the notification service (Member 3, UC-12) — settle the event-type enum up front.
- The invitation flow (Member 1, UC-24) triggers the pro-ration logic (Member 1, UC-20) on account activation — both are self-contained within Member 1's vertical.
- Comment thread notifications (Member 3, UC-28) follow the same notification service pattern as approval notifications — no extra work for Member 3.

---

## 7. Recommended Database Schema (High-Level)

```text
users
  id, name, email, password_hash, country, role, supervisor_id, manager_id,
  hod_id, dept, locale, active, invitation_status
  -- supervisor_id is single-valued (one supervisor per employee)
  -- a manager_id can appear on many users via different supervisors

user_invitations   -- new employee onboarding (UC-24)
  id, invited_by, email, name, country, dept, supervisor_id, manager_id,
  token_hash, expires_at, accepted_at, created_at

user_sessions   -- session management & security log (UC-25)
  id, user_id, token_hash, device_info, ip_address, last_active, revoked_at, created_at

security_events   -- login history & lockout tracking (UC-25)
  id, user_id, event_type, ip_address, success_flag, created_at
  -- event_type: LOGIN | LOGOUT | FAILED_LOGIN | PASSWORD_CHANGE | SESSION_REVOKED

announcements   -- system broadcasts (UC-26)
  id, title, body, target_type, target_id, start_date, end_date,
  requires_ack, created_by, created_at
  -- target_type: ALL | COUNTRY | ROLE

announcement_acks   -- acknowledgement tracking (UC-26)
  announcement_id, user_id, acked_at

leave_types
  code, name, affects_annual_balance, affects_sick_balance, requires_mc_flag, active
  -- e.g. ANNUAL, SICK_MC, SICK_NO_MC, UNPAID, MATERNITY, CHILDCARE, COMPASSIONATE, OTHER

leave_policies
  country, annual_min, annual_max, sick_with_mc, sick_no_mc, carry_forward_max

country_working_days   -- weekend config per country (UC-29)
  country, working_days_json
  -- e.g. { "mon":true, "tue":true, ..., "sat":false, "sun":false }

leave_balances
  user_id, year, annual_balance, sick_balance, carried_forward

leave_requests
  id, user_id, type_code, start_date, end_date, half_day_flag, half_day_period,
  computed_days, is_draft, status, supervisor_id, supervisor_status,
  manager_id, manager_status, special_approval_flag, approver_comment,
  ai_summary, submitted_at, decided_at, created_at
  -- half_day_period: AM | PM (null for full days)

leave_swap_requests   -- leave swap (UC-27)
  id, proposer_request_id, counterpart_request_id, proposer_user_id,
  counterpart_user_id, status, expires_at, created_at
  -- status: PENDING_ACCEPT | ACCEPTED | PENDING_APPROVAL | APPROVED | REJECTED | EXPIRED

request_comments   -- comment thread on requests (UC-28)
  id, leave_request_id, author_user_id, body, created_at
  -- append-only; no update or delete

attachments   -- medical certificates & supporting docs (UC-13)
  id, leave_request_id, file_name, file_type, storage_url, uploaded_by, uploaded_at

approval_delegations   -- acting approver (UC-15)
  id, from_user_id, to_user_id, start_date, end_date, reason, active, created_at

blackout_periods   -- restricted leave windows (UC-18)
  id, scope, scope_id, start_date, end_date, mode, reason
  -- scope: COUNTRY | TEAM ;  mode: BLOCK | SPECIAL_APPROVAL

min_staffing   -- minimum coverage rules (UC-17)
  id, scope, scope_id, min_headcount, critical_roles

public_holidays
  id, date, country_code, holiday_name, source, active
  -- source: MANUAL | IMPORTED ;  active supports Thailand's partial set

notifications
  id, user_id, type, message, read_flag, created_at

notification_preferences   -- per-user channel settings (UC-23)
  user_id, event_type, email_flag, inapp_flag

report_schedules   -- automated report delivery (UC-30)
  id, owner_user_id, report_type, frequency, delivery_day,
  format, recipients_json, active, last_run_at, created_at

audit_log
  id, action, user_id, entity, entity_id, before, after, timestamp

ai_interactions   -- chatbot history & observability
  id, user_id, feature, prompt, matched_template, response, tokens_used, created_at
```

---

## 8. Suggested Phased Build Plan

Build the Core of every vertical first so there is always a working end-to-end system, then layer Enhanced features. Do not start a phase until the previous phase compiles and passes its tests.

### Phase 1 — Foundation & Core Flow

- Authentication, RBAC, bcrypt hashing, session management, and database schema (Member 1)
- Employee leave application form (full/half-day) + personal calendar (Member 2)
- Sick leave form with MC/no-MC toggle (Member 2)
- Public-holiday import from the provided 2026 Excel (Member 4)
- Working-day & holiday-aware leave calculation with weekend config (Member 4)
- Two-tier approval workflow skeleton + balance deduction/restoration (Member 3)
- First AI integration: AI-1 NL leave parsing (Member 2 — highest demo impact, lowest risk)

### Phase 2 — Workflow Depth & Intelligence

- Complete two-tier approval with coverage-exception branch (Member 3)
- Overlap detection + AI-2 coverage analyzer (Member 4)
- AI-3 approval assistant card + comment thread on requests (Member 3)
- Notifications — email + in-app — with reminders and escalation (Member 3)
- Medical-certificate upload + request status tracker + drafts (Member 2)
- Approval delegation / acting approver and bulk approval with comments (Member 3)
- New employee invitation & onboarding flow (Member 1)
- System announcements broadcast (Member 1)

### Phase 3 — HR, Analytics & Enhanced Polish

- Year-end carry-forward job + bulk yearly entitlement update & pro-ration (Members 1, 5)
- Blackout periods, minimum-staffing rules, and manpower heatmap (Member 4)
- Leave swap request (Member 2)
- HR reporting suite with Excel/PDF export + audit-trail viewer (Member 5)
- Scheduled & automated report delivery (Member 5)
- AI-4 HR insights chatbot + AI-5 anomaly flags (Member 5)
- Self-service profile, notification preferences, localisation, .ics export (Members 1, 2)
- Mobile responsiveness polish, online holiday sync, demo preparation and rehearsal

---

## 9. Key Demo Points

1. **Calendar format** — show team leave and country-specific public holidays
2. **Overlap prevention** — two team members applying for the same dates; AI-2 explains why and suggests alternatives
3. **Two-tier approval flow** (Supervisor → Manager) with AI-3 assistant cards and comment thread — pitch the aim of cutting approval from "a week" toward same-day decisions
4. **Approval delegation** — show a supervisor going on leave and a deputy seamlessly handling approvals
5. **Manpower heatmap** — reveal a red (understaffed) day and how a blackout period blocks new leave
6. **Leave swap** — two employees swapping approved leave dates end-to-end through the approval chain
7. **Year-end carry-forward** — trigger the batch job live; show the 5-day cap in action
8. **Multi-country policy** — switch between Singapore and Thailand employees to show different rules, holiday sets, and sick-leave quotas
9. **Onboarding flow** — HR sends an invite; new employee registers and sees entitlement auto-computed
10. **AI-1 natural-language input** — type *"I need next Monday off"* and watch the form auto-fill
11. **AI-4 HR chatbot + AI-5 flags** — ask *"Which country has the most pending requests?"* and show a "leave about to be forfeited" alert
12. **Mobile responsiveness** — pull out a phone and walk through an application

---

## 10. Scope Notes & Assumptions

- **Integration with SME Payroll / CMMS:** Out of scope for the prototype. The system stands alone and can export data for downstream payroll.
- **Cross-country staff transfers:** Not implemented (client confirmed no inter-country transfers).
- **Native mobile app:** Not built. Mobile-responsive web is sufficient per client guidance.
- **Auto-approval / auto-escalation:** Removed entirely per client request. The 24-hour notification is a reminder only.
- **Leave type changes after submission:** Not allowed. Cancel and re-submit only.
- **Org cardinality:** Each Employee has exactly one Supervisor. A Manager may oversee multiple Supervisors (per client).
- **Batch job timezone:** All scheduled jobs run on Singapore Time (HQ).
- **AI calls:** Made server-side. Only minimum necessary context is sent; PII is masked where possible. The HR chatbot uses a fixed catalogue of parameterised queries — no free SQL generation.
- **Enhanced (E) features:** Scoped as second-priority. The Core system is fully functional without them; they are built in Phase 3 and can be trimmed if time is short.
- **Document uploads:** Stored via the app's own storage with access restricted to the owner, their approvers, and HR. No third-party sharing.
- **Leave taken in half-day or full-day blocks only** (per client) — the AM/PM field simply records which half.
- **Weekend config (UC-29):** Defaults to Saturday–Sunday for all countries; HR adjusts only where the company operates differently.
- **PoC data:** Sanitised CSV from client will be used once received. Synthetic data is used in the meantime.
