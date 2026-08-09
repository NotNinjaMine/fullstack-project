# Claude Code Prompt — Finish and Verify All Member 3 (M3) Work

## Project

You are working inside the extracted project:

```text
leave-app-Aug4-4pm/
```

This is an **Annual Leave Management System** for the SCCCI AI Challenge. The application uses:

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- ORM/database: Sequelize + MySQL
- Authentication: JWT with mandatory two-step verification in the current project
- AI integration: server-side hosted LLM with deterministic fallbacks

Your assigned scope is **Member 3 (M3): Approval, Delegation, Notifications, Comments, and AI-3**.

Do not merely review or describe the code. **Inspect, edit, test, and finish the implementation.** Continue until every requirement and acceptance test in this document is satisfied or a genuine external blocker is proven with command output.

---

# 1. Read these files before editing

Read the following completely, in this order:

1. `M3_FINAL_COMPLETION_PROMPT.md` — this file
2. `CLAUDE_CODE_M3_COMPLETION_PROMPT.md`
3. `CODEX_HANDOFF_M3.md`
4. `M3_COMPLETION_REPORT.md`
5. `Tier3_M3_Approval_Delegation_Notification.md`
6. `Leave_Management_System_UseCases_and_TaskAllocation_4.md`
7. `HLD_LeaveManagementSystem_3.md`
8. `Implementation_Plan_LeaveManagementSystem_2.md`
9. Relevant source and test files under `server/` and `client/`

Use the real repository conventions as the implementation source of truth:

- MySQL + Sequelize, not PostgreSQL
- Routes are mounted using existing paths such as `/leave`, `/notification`, `/delegation`, and `/ai`
- Preserve the repository’s existing response shapes
- Schema changes are additive Sequelize model fields applied through `sequelize.sync({ alter: true })`
- Do not introduce a new migration framework
- Do not add a runtime dependency unless it is absolutely unavoidable and justified in the report

If the documents conflict, use this priority:

1. Security, data integrity, and server-side authorization
2. This prompt’s final acceptance requirements
3. `CLAUDE_CODE_M3_COMPLETION_PROMPT.md` and `CODEX_HANDOFF_M3.md`
4. The task-allocation/use-case document
5. The HLD where it matches the real codebase

---

# 2. Preserve the completed T1–T10 work

The current archive already contains substantial M3 work. Do not remove or weaken it.

Preserve and re-verify:

- Transactional two-tier approval with row locking
- Supervisor → Manager server-side state machine
- Balance deduction only on final Manager approval
- Protection against concurrent double approval/double deduction
- Coverage-exception acknowledgement on individual Manager approval
- Request-level AI-3 authorization
- LLM timeout, response validation, sanitized errors, and deterministic fallback
- Original-team routing during delegation
- Singapore-time delegation handling
- Same-tier delegation in the current project:
  - Supervisor → Supervisor
  - Manager → Manager
- Delegation validation, audit, revoke, expiry, and notifications
- Independent in-app/email notification preferences
- Cancellation notifications for pending requests
- Stage-scoped 24-hour reminders and deduplication
- Shared notification bell
- Employee comment-thread access
- Mandatory bulk-rejection reason
- Real 2FA flow in integration tests
- No production `demoCode`

Run existing tests before making changes and again after every meaningful group of changes. A new change must not regress any T1–T10 behavior.

---

# 3. Scope boundaries

Work only on M3 and the smallest shared changes required for M3 integration.

## M3 use cases

- UC-02 — Two-Tier Approval Workflow
- UC-08 — Approver calendar/history visibility
- UC-12 — Notifications and 24-hour reminders
- UC-15 — Delegation / Acting Approver
- UC-16 — Bulk Approval with Comments
- UC-28 — Comment Thread and Discussion
- AI-3 — Approval Assistant

## Do not redesign unrelated modules

Do not rewrite:

- Authentication architecture
- Employee leave application flow
- Country policy engine
- Holiday calculation
- HR reporting
- Database-wide naming conventions
- Shared UI design system

Only adjust shared code where M3 correctness requires it. Preserve teammate code and current working features.

---

# 4. Security and configuration rules

These rules are mandatory:

1. Never hardcode or print database passwords, JWT secrets, SMTP credentials, phone provider credentials, or LLM/API keys.
2. Never copy credentials into source, tests, Markdown reports, console output, screenshots, or the final ZIP.
3. Keep real `.env`, `.env.test`, and generated secret files gitignored.
4. Update only `.env.example` when documentation is needed, using placeholders.
5. All AI calls must remain server-side.
6. Do not expose raw provider errors, request headers, prompts containing unnecessary PII, or API keys to the browser.
7. Authorization must be enforced in backend routes and services. Hiding buttons is not authorization.
8. Do not weaken 2FA to make tests easier.
9. Use a dedicated test database. Never seed or mutate the development database during automated tests.
10. Never claim a test passed unless you actually ran it and saw the successful output.

---

# 5. Final missing M3 work to implement

The T1–T10 completion report is not the end of the assignment. Complete the remaining specification gaps below.

---

## R1 — Add the Approver Team Schedule view (UC-08)

The M3 frontend requires an **Approver’s team-schedule view**. The current Employee page has a team calendar, but the Approver page does not.

### Backend requirements

Inspect:

- `server/routes/leaveRequest.js`
- `server/services/delegationService.js`
- `server/models/User.js`
- `server/models/LeaveRequest.js`

The existing endpoint is:

```http
GET /leave/team-calendar
```

Extend it safely if needed so an approver can view only an authorized team schedule.

Required visibility:

- Employee: own team only
- Supervisor: own team
- Manager: own authorized team according to the current project data model
- Active delegate: own team plus the team covered by a currently active same-tier delegation
- HR Admin: not part of the M3 UI; do not broaden access unless an existing HR feature needs it
- Any unauthorized team query: `403`

Never expose leave reasons, leave type, medical information, or attachments in this endpoint. Return only the minimum scheduling data, such as:

- Team member ID, name, initials
- Approved leave start/end dates
- Half-day indicator if already part of the existing shape

If supporting delegated teams, accept a clearly validated team selector, for example:

```http
GET /leave/team-calendar?team=Team%20B
```

Do not allow arbitrary team enumeration. Resolve allowed teams on the server from the authenticated user and active delegations.

### Frontend requirements

Inspect:

- `client/src/pages/Approver.jsx`
- `client/src/pages/Employee.jsx`
- `client/src/lib/dates.js`
- Existing Tailwind design tokens in `client/src/index.css`

Add a responsive team-schedule section to `Approver.jsx`, or extract a reusable component if that produces less duplication.

The view must include:

- Current month or useful date range
- Approved team leave dates
- Team member names/initials
- Empty state
- Loading state
- Safe error state
- Team selector only when the approver is authorized for more than one team, including delegated coverage
- Clear “acting for” context for a delegated team
- Mobile-responsive layout

Do not show sensitive request reasons or leave types.

### R1 tests

Add backend integration coverage for:

1. Supervisor can view own team schedule.
2. Wrong-team query returns `403`.
3. Active same-tier delegate can view the delegated team schedule.
4. Expired/revoked delegate cannot view the delegated team schedule.
5. Response contains dates/people only and does not contain `reason`, attachment data, medical data, or private notes.

The client production build must pass.

---

## R2 — Correct full approval-chain comment access (UC-28)

The current `isCommentParticipant` logic is too tied to the current approval tier. After Supervisor approval, the original Supervisor can lose access while the request remains pending with the Manager. UC-28 requires a shared discussion among the parties in the approval chain.

Inspect:

- `server/routes/leaveRequest.js`
- `server/models/Comment.js`
- `server/models/AuditLog.js`
- `server/services/delegationService.js`
- `server/services/notificationService.js`
- `client/src/components/CommentThread.jsx`
- `client/src/pages/Approver.jsx`
- `client/src/pages/Employee.jsx`

### Required read access

For a request, the following may read the thread:

- The request owner
- The original team’s Supervisor
- The original team’s Manager
- A currently active same-tier delegate acting for the original Supervisor or Manager
- HR Admin for audit viewing, if the existing HR interface opens this thread

Do not grant access to unrelated same-role users from other teams.

### Required posting access while pending

While status is `PENDING_SUPERVISOR` or `PENDING_MANAGER`, the following may post:

- Request owner
- Original team Supervisor
- Original team Manager
- Active same-tier delegates covering either original approval tier

HR Admin may read for audit but should not post unless an existing explicit requirement already permits it.

### Locked state

Posting must be rejected after the request becomes:

- `APPROVED`
- `REJECTED`
- `CANCELLED`
- Any other terminal state

Terminal threads remain readable by authorized participants.

### Authorization design

Refactor the current helper into explicit read/write authorization if useful, for example:

```js
canReadCommentThread(user, request, delegations)
canPostComment(user, request, delegations)
```

The functions must use the employee’s original team. Delegation adds an authorized participant; it must not reroute request ownership.

### R2 tests

Add integration tests proving:

1. Employee can read/post on own pending request.
2. Original Supervisor can still read/post after the request advances to `PENDING_MANAGER`.
3. Original Manager can read/post while the request is pending.
4. Active delegate can read/post for the delegated team.
5. Wrong-team Supervisor and Manager receive `403`.
6. HR Admin can read but cannot post, if HR read access is implemented.
7. All authorized participants can still read after a terminal decision.
8. No participant can post after a terminal decision.

---

## R3 — Notify all relevant comment-thread participants

Current behavior mainly notifies the employee or the current-tier approver. A discussion thread should notify the other relevant approval-chain participants.

### Required recipients

When a new comment is posted, notify all other currently authorized chain participants, excluding the author and deduplicating recipients:

- Request owner
- Original team Supervisor
- Original team Manager
- Active same-tier delegate(s) covering the original team

Do not notify unrelated approvers. Do not duplicate a notification if one person is reached through multiple paths.

Use the existing `notify()` service so:

- `notifyInApp` independently controls the notification row
- `notifyEmail` independently controls email delivery
- Provider failure does not fail the comment transaction

Notification text must not expose sensitive details. Use a safe message such as:

```text
New comment on leave request REQ-123 from Jane Tan.
```

Do not place the full comment body in email subject lines or push-style notification text.

### Delivery semantics

- Persist the comment and its audit record first.
- Send notifications after the database transaction commits.
- Notification/email failure must not roll back a valid comment.

### R3 tests

Add tests for:

1. Employee comment notifies Supervisor and Manager, plus an active delegate where applicable.
2. Supervisor comment notifies Employee and Manager.
3. Manager comment notifies Employee and Supervisor.
4. Author is excluded.
5. Recipients are deduplicated.
6. Wrong-team users receive nothing.
7. Notification preferences are respected.
8. Mail failure does not delete or roll back the comment.

---

## R4 — Write every comment to the audit log

UC-28 requires comments to be timestamped, attributed, append-only, and written to the audit trail.

The existing `createComment()` creates a `Comment` row but does not always create an `AuditLog` entry.

### Required implementation

Create the comment and audit entry atomically in one Sequelize transaction.

Audit entry must include:

- `requestId`
- Actual actor name
- Actual actor role in the action text if the current schema has no role column
- Delegation context when acting for another approver
- A safe action such as `Comment posted by Supervisor` or a comment ID/reference

Do not store the entire comment body in the audit action field. A short sanitized preview is acceptable only if it does not expose medical/sensitive content; the preferred implementation is metadata only.

Apply this to:

- Normal `POST /leave/:id/comments`
- Optional approval decision comments
- Bulk decision comments/rejection reasons that create `Comment` rows

Do not create update or delete routes for comments. Comments remain append-only.

### R4 tests

Add integration tests proving:

1. A posted comment creates exactly one Comment row and one corresponding AuditLog row.
2. Failed comment validation creates neither row.
3. Unauthorized posting creates neither row.
4. Terminal-request posting creates neither row.
5. Bulk rejection comment creates a comment audit record for each successfully processed request.
6. A failed item in a mixed bulk request does not create comment/audit rows for that failed item.

---

## R5 — Strictly exclude coverage-flagged requests from bulk actions (UC-16)

The task-allocation specification states that requests requiring special approval are excluded from bulk actions. The current code prevents unacknowledged bulk approval but may still allow flagged selection or bulk rejection.

### Backend requirements

In `PUT /leave/bulk-decide`:

- A request with `flagged === true` must not be approved or rejected through bulk processing.
- Return a per-request failure such as:

```json
{
  "id": 123,
  "ok": false,
  "message": "Coverage-flagged requests require individual Manager review."
}
```

- Continue processing other eligible requests independently.
- Do not create a decision comment, audit decision, balance update, or final notification for an excluded flagged item.
- Individual Manager approval remains available through `PUT /leave/:id/decide` and requires explicit `acknowledgeException=true`.
- Individual rejection remains available with a mandatory reason.

### Frontend requirements

In `Approver.jsx`:

- Disable or hide the bulk-selection checkbox for flagged requests.
- Exclude flagged requests from “select all.”
- Add an accessible label/tooltip such as “Requires individual coverage-exception review.”
- Keep the individual decision controls available.
- The Manager must still see and tick the explicit coverage-exception acknowledgement before individual approval.

### R5 tests

Add tests proving:

1. Flagged request cannot be bulk-approved, even if `acknowledgeException=true` is sent.
2. Flagged request cannot be bulk-rejected.
3. Flagged request remains unchanged.
4. No decision comment/audit/balance mutation/final notification is produced for it.
5. Unflagged requests in the same bulk call still process independently.
6. Individual Manager approval with acknowledgement still works.

---

## R6 — Complete real MySQL verification and fix any failures

The current report says the MySQL suite was not runnable in the previous environment. On the user’s local machine, complete it.

### Database safety

- Use a dedicated `leave_test` database.
- Use `server/.env.test`, which must remain gitignored.
- Never point tests at the development `leave` database.
- Preserve the safety guard in `server/scripts/seedTestDb.js`.
- Do not include local credentials in reports or the final ZIP.

### Required commands

From `server/`:

```bash
npm install
npm run check
npm run test:unit -- --runInBand
npm run seed:test
npm run test:m3 -- --runInBand
npm test -- --runInBand
```

From `client/`:

```bash
npm install
npm run build
```

If MySQL is unavailable:

1. Check the configured host/port and whether the MySQL service is running.
2. Check that the dedicated test schema exists.
3. Check that the configured non-root application/test account has privileges only as needed.
4. Report the exact external failure without fabricating test success.

Do not stop at the first failing test. Diagnose and fix actual code/test-data problems until all runnable suites pass.

---

# 6. Re-verify all core M3 requirements

After R1–R6, re-audit and test all M3 behavior, including existing T1–T10.

---

## A. Two-tier state machine

Required states and transitions:

```text
Employee submits
  -> PENDING_SUPERVISOR

Supervisor approves
  -> PENDING_MANAGER

Supervisor rejects with mandatory reason
  -> REJECTED

Manager approves
  -> APPROVED
  -> balance deducted exactly once

Manager rejects with mandatory reason
  -> REJECTED
```

Reject invalid transitions server-side:

- Manager acting before Supervisor approval
- Supervisor acting after the request reaches Manager
- Repeated approval/rejection
- Acting on approved/rejected/cancelled requests
- Wrong-team approver
- Expired/revoked delegate
- Self-approval if the current project permits non-Employee users to submit leave

Every valid decision must create an audit entry. External notification failure must not undo a committed decision.

---

## B. Final approval transaction

Manager final approval must atomically:

1. Lock/reload the request
2. Revalidate status and authority inside the transaction
3. Revalidate coverage acknowledgement inside the transaction
4. Lock/reload the relevant balance
5. Deduct once
6. Save final status
7. Save audit entry
8. Save decision comment if supplied
9. Commit
10. Notify after commit

Concurrent approval attempts must result in one valid approval and one safe failure, with one balance deduction.

---

## C. Coverage exception

- Supervisor endorsement routes flagged requests to Manager.
- Only an individual Manager decision can approve the exception.
- Manager must explicitly acknowledge it.
- AI cannot acknowledge or decide.
- Flagged requests are excluded from all bulk actions.

---

## D. Delegation

- Same-tier only in this project.
- Active users only.
- No self-delegation.
- Valid start/end dates using Singapore business date.
- Reject conflicting/overlapping delegations.
- Original approver retains visibility.
- Delegate authority applies only during active dates.
- Delegation never collapses Supervisor and Manager stages.
- Original employee team remains the approval chain.
- Revoke and expiry are audited and notified once.
- Acting-for information appears in audit and UI.

---

## E. Notifications and reminders

Required events include:

- New request → responsible Supervisor/delegate
- Supervisor approval → responsible Manager/delegate
- Supervisor rejection → Employee
- Manager final decision → Employee
- New comment → all other relevant chain participants
- Pending request over 24 hours → current responsible approver/delegate
- Pending cancellation → current responsible approver/delegate
- Delegation create/revoke/expiry → relevant users

Reminder rules:

- Reminder only; never auto-approve, reject, route, or escalate state
- Based on current stage entry time
- Resets when stage changes
- Stops for terminal requests
- Delegation-aware recipient
- Deduplicated by request, stage, and recipient

---

## F. AI-3

AI-3 is advisory only.

Required card data:

- Employee recent leave pattern
- Team headcount/coverage on requested dates
- Historical comparison where available
- Recommendation: approve / approve with note / individual review
- Clear disclaimer that the approver remains responsible

Required safety:

- Request-level authorization, including delegates
- Wrong-team request IDs return `403` without data leakage
- Server-side provider calls only
- Timeout through `LLM_TIMEOUT_MS`
- Sanitized output and safe provider errors
- Deterministic fallback when no key/provider failure/malformed response/timeout
- Manual approval remains available if AI is unavailable
- No API key in browser code

---

# 7. Automated test requirements

Keep all existing tests. Add focused tests rather than replacing broad suites.

At minimum, final tests must cover:

## Approval

- Supervisor approve → Manager stage
- Supervisor reject requires reason
- Manager cannot approve Supervisor stage
- Manager final approval deducts once
- Concurrent final approvals deduct once
- Terminal request cannot be decided again
- Wrong team/delegate authority denied

## Coverage

- Flagged individual Manager approval requires acknowledgement
- Flagged request excluded from bulk approve and bulk reject

## Delegation

- Same-tier active delegation succeeds
- Cross-tier, inactive-user, self, invalid dates, and overlap fail
- Original team chain preserved
- Revoked/expired delegation loses authority
- Delegated queue and schedule show acting-for context

## Comments

- All original chain participants can read/post while pending
- Original Supervisor retains access at Manager stage
- Active delegates can participate
- Wrong team denied
- HR read-only if implemented
- Terminal read allowed, terminal post denied
- Append-only behavior
- Comment and audit written atomically
- Notifications go to all other chain participants and are deduplicated

## Notifications/reminders

- Read/unread ownership
- Independent channel preferences
- Safe email failure
- Stage-relative exact 24-hour reminder
- Delegate routing
- Dedupe
- Stop after resolution

## AI-3

- Correct team access
- Wrong-team denial
- Delegate access
- Provider success/failure/timeout/malformed response
- Deterministic fallback

## Authentication

- Login does not directly return access token under mandatory 2FA
- Test helper completes real challenge
- Production never returns demo code

---

# 8. Manual end-to-end verification

After automated tests pass, start the server and client against the development database and manually verify these scenarios.

Do not put passwords in the report; list account identifiers only.

## Scenario 1 — Normal approval

1. Employee submits an unflagged request.
2. Supervisor receives notification.
3. Supervisor opens AI-3 card and comment thread.
4. Supervisor comments and approves.
5. Manager receives notification.
6. Supervisor retains comment access at Manager stage.
7. Manager comments and approves.
8. Employee receives final notification.
9. Balance decreases exactly once.
10. Audit timeline shows comments and both decisions.

## Scenario 2 — Coverage exception

1. Employee submits a flagged request.
2. Supervisor endorses it.
3. It cannot be selected for bulk action.
4. Manager cannot approve without acknowledgement.
5. Manager ticks acknowledgement and approves individually.
6. Audit records explicit coverage-exception approval.

## Scenario 3 — Rejection

1. Supervisor or Manager attempts rejection without reason and is blocked.
2. Valid reason succeeds.
3. Employee receives reason.
4. Comment and audit entries are present.

## Scenario 4 — Delegation

1. Create an active same-tier delegation.
2. Delegate sees the acting-for queue.
3. Delegate sees the delegated team schedule.
4. Delegate comments and decides only the correct tier.
5. Original approver retains visibility.
6. Request continues to the employee’s original Manager chain.
7. Revoke delegation and verify authority disappears.
8. Confirm revoke audit and notification.

## Scenario 5 — Comments

1. Employee posts; Supervisor and Manager are notified.
2. Supervisor posts; Employee and Manager are notified.
3. Manager posts; Employee and Supervisor are notified.
4. No author receives their own duplicate notification.
5. After final decision, all authorized chain participants can read but nobody can post.

## Scenario 6 — Reminder

1. Create/adjust a request so current stage is older than 24 hours in the test environment.
2. Run reminder sweep.
3. Only current responsible approver/delegate is notified.
4. Immediate re-run creates no duplicate.
5. After stage change or final decision, old-stage reminder does not fire.

## Scenario 7 — AI failure

1. Run without an LLM key or mock provider failure.
2. AI-3 displays deterministic advisory data/fallback.
3. Manual comments and decisions remain fully functional.
4. Browser receives no raw provider exception or secret.

---

# 9. Code quality requirements

- Keep functions small and intention-revealing.
- Reuse shared services instead of duplicating authorization logic.
- Prefer explicit read/write authorization helpers for comments.
- Use transactions for multi-row business operations.
- Keep external email/AI delivery outside critical database transactions.
- Deduplicate notification recipients.
- Validate and trim all user text.
- Do not log OTPs, keys, tokens, medical data, or full sensitive comments.
- Preserve existing response conventions unless a security issue requires a safe change.
- Preserve mobile responsiveness and existing visual design.
- Do not leave dead code, commented-out temporary code, debug endpoints, or test-only production bypasses.

---

# 10. Required final deliverables

When the work is complete, produce all of the following.

## 1. Updated source project

All code changes inside the existing project structure.

## 2. `M3_FINAL_COMPLETION_REPORT.md`

Create this in the project root with:

- Date and timezone
- Exact M3 scope completed
- T1–T10 regression status
- R1–R6 implementation summary
- File-by-file change table
- Additive schema changes
- Security decisions
- Test commands and exact results
- Integration test count and result
- Client build result
- Manual scenario result
- Genuine remaining external limitations only
- No credentials or secrets

## 3. `M3_TESTING_AND_DEMO_GUIDE.md`

Create this in the project root with:

- Setup prerequisites
- Safe `.env`/`.env.test` guidance using placeholders only
- Database seed command
- Server/client start commands
- Account identifiers and roles only, no passwords
- Step-by-step demo for approval, exception, rejection, delegation, comments, reminders, notification center, team schedule, and AI-3 fallback
- Expected result after every step
- Troubleshooting for MySQL connection, 401/403, 2FA, and missing notifications

## 4. Final clean ZIP

Create:

```text
leave-app-M3-final.zip
```

Exclude:

- `node_modules/`
- `dist/`
- `.env`
- `.env.test`
- Any key, token, credential, database dump containing secrets, or local log
- Temporary screenshots/build caches

Include:

- Source code
- `.env.example`
- Tests
- `M3_FINAL_COMPLETION_REPORT.md`
- `M3_TESTING_AND_DEMO_GUIDE.md`
- Existing specification/handoff files

Before packaging, search the project for likely exposed secrets and report only filenames/findings, never print secret values.

---

# 11. Final acceptance checklist

Do not declare completion until every applicable item is true.

## Core workflow

- [ ] Supervisor → Manager ordering is enforced server-side.
- [ ] Manager cannot be bypassed or act early.
- [ ] Balance is deducted only on final Manager approval.
- [ ] Concurrent final approval deducts once.
- [ ] Rejection reason is mandatory.
- [ ] Every decision is audited.

## Coverage

- [ ] Manager explicitly acknowledges flagged individual approval.
- [ ] Flagged requests are excluded from bulk approval and bulk rejection.

## Delegation

- [ ] Same-tier, active, non-overlapping delegation is enforced.
- [ ] Singapore business date is used.
- [ ] Original team chain is preserved.
- [ ] Original approver retains visibility.
- [ ] Delegate queue and schedule are authorized.
- [ ] Revoke/expiry removes authority and produces one audit/notification.

## Comments

- [ ] Employee, original Supervisor, and original Manager share the pending thread.
- [ ] Original Supervisor retains access during Manager stage.
- [ ] Active delegates can participate only for covered teams.
- [ ] HR is read-only if enabled.
- [ ] Wrong-team access is denied.
- [ ] Comments are append-only.
- [ ] Terminal threads are read-only.
- [ ] Every comment creates an audit entry atomically.
- [ ] All other relevant participants are notified without duplicates.

## Notifications

- [ ] In-app/email preferences work independently.
- [ ] Read/unread state is secure by owner.
- [ ] 24-hour reminder is stage-relative, delegate-aware, and deduplicated.
- [ ] No reminder changes request state.

## UI

- [ ] Approver queue works on desktop and mobile.
- [ ] Approver team schedule exists and is authorization-safe.
- [ ] Delegated team schedule shows acting-for context.
- [ ] Flagged requests cannot be bulk-selected.
- [ ] AI-3 remains advisory.
- [ ] Employee and approver comment threads work.
- [ ] Shared notification center works.

## Security and quality

- [ ] No secrets are present in source, docs, ZIP, or logs.
- [ ] Production never returns a demo 2FA code.
- [ ] Wrong-team AI/comment/calendar access returns `403` without data leakage.
- [ ] Server syntax check passes.
- [ ] All unit tests pass.
- [ ] All MySQL integration tests pass locally.
- [ ] Full Jest run passes.
- [ ] Client production build passes.
- [ ] Final reports accurately state results.
- [ ] Clean final ZIP is created.

---

# 12. Required final response

At the end, respond with a concise completion summary containing:

1. What was implemented
2. Tests/builds run with exact pass/fail counts
3. Any genuine external blocker
4. Paths to:
   - `M3_FINAL_COMPLETION_REPORT.md`
   - `M3_TESTING_AND_DEMO_GUIDE.md`
   - `leave-app-M3-final.zip`

Do not say “complete” if the MySQL integration suite was not run successfully. In that case, say exactly which verification remains and why.
