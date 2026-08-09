# Claude Code Prompt — Complete Member 3 (M3)

## Project context

You are working on a full-stack Annual Leave Management System assignment. Your responsibility is to complete and verify **Member 3 (M3): Approval, Delegation, Notifications, and AI-3**.

The project materials include:

- The assignment presentation/guide, which is the primary source of truth.
- The extracted project source code from the supplied ZIP archive.
- M3-specific documentation and automated tests already present in the repository.

Do not merely describe possible fixes. Inspect the actual repository, implement the fixes, run the relevant tests, and leave the M3 feature in a demonstrable state.

---

## Mandatory working order

Follow this order exactly:

1. Locate and read the **entire assignment presentation/guide**, not only the M3 slides.
2. Extract every M3 requirement, related use case, role rule, business rule, UI expectation, AI requirement, testing requirement, and marking criterion.
3. Read any M3-specific guide or README in the repository.
4. Inspect the complete ZIP/project structure and trace the existing M3 implementation across:
   - database schema and migrations;
   - models/repositories;
   - services;
   - controllers and routes;
   - authentication and authorization middleware;
   - scheduled jobs;
   - real-time notification code;
   - frontend pages and components;
   - unit and integration tests.
5. Before editing, produce a short requirement-to-code traceability table showing:
   - requirement;
   - existing file(s);
   - current status;
   - required change.
6. Then implement and verify all required M3 changes.

If the guide and existing tests contradict each other, treat the presentation/assignment guide as the primary source of truth. Update an incorrect test when necessary and document the reason. Do not weaken correct production behavior merely to satisfy an outdated test.

---

## Scope boundaries

Work only on M3 and the minimum shared code needed for M3 to function correctly.

- Preserve working features owned by other members.
- Follow the repository's existing architecture, naming conventions, response format, styling, and package manager.
- Prefer focused changes over large rewrites.
- Do not replace the existing authentication system or redesign the entire database.
- Do not delete existing tests to make the suite pass.
- Do not disable security checks globally.
- Do not push, merge, force-push, or rewrite Git history unless explicitly instructed.
- Do not claim success from static inspection alone; verify behavior with tests and builds.

---

## Security and configuration rules

The database passwords and OpenRouter key previously shared in chat must be treated as exposed. **Never copy them into source code, this prompt, test fixtures, logs, commits, screenshots, or documentation.**

Implement configuration using environment variables only. Use placeholder names such as:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=leave_management
DB_USER=leave
DB_PASSWORD=replace_with_local_password
OPENROUTER_API_KEY=replace_with_new_rotated_key
OPENROUTER_MODEL=replace_with_supported_model
APP_TIMEZONE=Asia/Singapore
```

Requirements:

- Keep real `.env` and `.env.test` files gitignored.
- Add or update `.env.example` with placeholders only.
- Use the limited MySQL application user for normal application and test access; do not run the application as MySQL `root`.
- Fail safely when a required production secret is missing.
- Mock OpenRouter in automated tests; tests must not spend credits or depend on the external service.
- Add request timeouts and safe error handling for the OpenRouter call.
- Never return stack traces, SQL details, secrets, or raw provider errors to the browser.

---

## Known baseline from the initial review

The initial review found the following:

- All 13 dedicated M3 pure unit tests passed.
- Server JavaScript syntax checks passed.
- The React production build passed.
- The normal Supervisor-to-Manager flow is substantially implemented.
- Coverage acknowledgement, AI-3 cards, audit history, comments, bulk actions, delegation, and notifications already have partial implementations.
- The complete integration suite could not be verified without a configured MySQL test database.
- The login test helper expects a JWT immediately, while the application normally enforces two-factor authentication.
- Existing delegation behavior can route a request through the delegate's team instead of the employee's original approval chain.
- Employee access to notifications and comments is incomplete.
- AI endpoints do not fully validate team/delegation authority.
- Notification preferences and cancellation notifications have gaps.
- Final approval is not safely atomic in the reviewed implementation.
- UTC date conversion can make delegation dates incorrect around midnight in Singapore.

Reconfirm every point against the current source before changing it.

---

# Required M3 implementation

## 1. Server-side two-stage approval state machine

Enforce the workflow on the server, not only in the UI:

1. An employee submits a leave request.
2. The request enters the existing **pending Supervisor** state.
3. Only the employee's authorized Supervisor, or that Supervisor's currently active valid delegate, may make the first-stage decision.
4. Supervisor approval moves the request to the existing **pending Manager** state.
5. Supervisor approval must not deduct the employee's leave balance.
6. Only the employee's authorized Manager, or that Manager's currently active valid delegate, may make the final decision.
7. Manager approval moves the request to the existing final-approved state and deducts the balance exactly once.
8. Rejection at either stage moves the request to the existing rejected state and must never deduct the balance.
9. Cancelled, rejected, or finally approved requests cannot be decided again.
10. Invalid transitions must return an appropriate `4xx` response and must not partially update any record.

Use the existing status constants and schema names. Do not invent duplicate status values if equivalent ones already exist.

### Atomic final approval

Final Manager approval must use one MySQL transaction containing all critical database work:

- lock or conditionally update the current pending request;
- revalidate its current stage and approver authority;
- revalidate any coverage-exception acknowledgement;
- change the final status;
- deduct the correct leave balance exactly once;
- write the audit entry;
- create any database-backed notification/event record that must be atomic with the decision.

Use row locking, an atomic conditional update, or an equivalent repository-supported mechanism so two concurrent requests cannot both approve the same leave request or deduct the balance twice. Roll back all database changes if any critical operation fails.

Test concurrent/double-submission behavior.

---

## 2. Coverage-exception acknowledgement

When the existing coverage logic marks a request as an exception:

- Show the warning clearly to the Manager.
- Require the Manager to tick an explicit acknowledgement before final approval.
- Validate the acknowledgement again on the server.
- Do not allow a direct API call or bulk action to bypass it.
- Record the acknowledgement, actor, timestamp, and relevant reason/coverage data in the audit trail using the existing schema where possible.
- Do not require this Manager-only acknowledgement for a Supervisor's first-stage approval unless the official guide explicitly says otherwise.

Return a clear validation error when acknowledgement is missing.

---

## 3. Delegation

Implement delegation consistently across the database, API, authorization layer, queue routing, UI, audit trail, notifications, and tests.

Unless the assignment guide explicitly specifies a different rule, use **same-tier delegation**:

- Supervisor to Supervisor;
- Manager to Manager.

Required behavior:

- A delegation has a delegator, delegate, start date/time, end date/time, status, and audit timestamps.
- Reject self-delegation, invalid role combinations, invalid date ranges, inactive users, and conflicting/overlapping delegations according to the existing business rules.
- A delegation is usable only during its active interval.
- Expired delegation authority must stop automatically even if no cleanup job has run.
- Use `Asia/Singapore` business time; do not derive the local calendar date with UTC `toISOString()`.
- An active delegate acts **on behalf of the original approver**.
- Never change the employee's team or approval chain to the delegate's own team.
- If a delegate approves the Supervisor stage for a Team A employee, the request must still go to Team A's original Manager.
- A delegate may see and decide only requests covered by a valid delegation.
- Record both the actual actor and the original approver/delegator in the audit trail.
- Display "acting for ..." in the approver interface where appropriate.
- Notify affected users when a delegation becomes active, is changed/revoked, or expires if required by the guide.

Resolve the known contradictory test that expects a Supervisor-to-Manager delegation. Align the code, UI, fixtures, and tests with the official guide; if the guide is silent, use the same-tier rule above and update that test.

---

## 4. AI-3 advisory summary card

For every pending request visible to an authorized approver, provide the required advisory card containing:

- relevant leave pattern/history summary;
- coverage strip or coverage status;
- concise recommendation;
- a clear indication that the recommendation is advisory and the human approver makes the decision.

### Authorization

For the AI summary and draft-note endpoints, validate all of the following on the server:

- the caller is an authenticated Supervisor or Manager;
- the request exists;
- the caller is the correct approver for the employee's original chain, or has an active delegation from that approver;
- the request is at a stage the caller is allowed to view or decide.

Changing a request ID manually must not expose another team's employee or leave information.

### Reliability and testing

- Put OpenRouter access behind a small service/interface that can be mocked.
- Use a bounded timeout.
- Validate and sanitize the provider response.
- On timeout, missing key, rate limit, invalid response, or provider failure, show a deterministic non-AI fallback assembled from available leave and coverage data.
- The approval page must remain usable when AI is unavailable.
- Do not automatically approve or reject a request from the AI output.
- Do not send unnecessary personal data to the provider.
- Mock successful, failed, timed-out, and malformed responses in automated tests.

---

## 5. Notifications and reminders

Complete the existing real-time in-app notification system rather than introducing an unrelated second system.

Generate notifications for all events required by the guide, including at minimum where applicable:

- new request submitted to the current Supervisor;
- Supervisor approval routed to the Manager;
- rejection sent to the employee;
- final approval sent to the employee;
- cancellation sent to the current approver;
- new comment sent to the other conversation participants;
- delegation lifecycle events;
- reminders for requests pending longer than 24 hours.

Required behavior:

- Put the notification bell and unread count on every relevant authenticated interface, including the employee interface.
- Allow users to open the notification list, mark one as read, and mark all as read if supported by the existing design.
- Real-time events must also be persisted so notifications are not lost after refresh/reconnect.
- Enforce user ownership on notification read/update endpoints.
- Respect `notifyInApp` before creating/delivering an in-app notification.
- Respect `notifyEmail` before attempting email delivery.
- A failure to send email must not undo a valid approval, but it must be logged safely for retry/diagnosis.

### Reminders older than 24 hours

- Determine age from the timestamp at which the request entered its current pending stage, not blindly from the original creation time.
- Send the reminder to the approver currently responsible for that stage or to the valid active delegate according to the official routing rule.
- Prevent duplicate reminder spam. Use an idempotency key or persisted record based on request, stage, recipient, and reminder window.
- If the request advances, is rejected, is cancelled, or is finally approved, the old-stage reminder must no longer be sent.
- Make the reminder job safe to run repeatedly and concurrently.
- Test the exact 24-hour boundary and delegation changes.

---

## 6. Comments and audit trail

Complete the request discussion feature:

- Show the comment thread on the approver request-details view.
- Show the same authorized thread on the employee's own request-details view.
- Permit only authorized participants to view or add comments.
- Validate length/content, trim empty comments, and escape/render safely to prevent XSS.
- Notify the other relevant participants when a comment is added.
- Do not allow comments to change workflow state.

Maintain an append-only audit timeline for important M3 actions, including:

- submission;
- Supervisor decision;
- Manager decision;
- rejection reason where applicable;
- coverage acknowledgement;
- cancellation;
- comments if the current design audits them;
- delegation creation/change/revocation/expiry;
- delegated action showing both actor and "acting for" approver.

Do not allow normal application routes to edit or delete audit history.

---

## 7. Bulk decisions

Bulk approval/rejection must call the same domain/state-machine service used by a single decision. It must not duplicate or bypass approval rules.

Requirements:

- Authorize every selected request independently.
- Validate every current state independently.
- Preserve Supervisor-to-Manager routing.
- Never deduct balance at the Supervisor stage.
- Never bypass Manager coverage acknowledgement.
- Prevent duplicate final deduction.
- Return a per-request success/failure result so one invalid item is visible rather than silently ignored.
- Decide and document whether the existing design uses one transaction for the whole batch or one transaction per request. Prefer one transaction per request if partial success is the established UI behavior.
- Test mixed valid/invalid selections and repeated submissions.

---

## 8. Approver and employee user interfaces

Complete and verify the existing responsive UI.

### Approver interface

- Pending queue filtered to only authorized requests.
- Clear current stage and status.
- Employee/request details.
- AI-3 summary card with pattern, coverage, and advisory recommendation.
- Coverage-exception warning and Manager acknowledgement control.
- Approve and reject controls with disabled/loading states.
- Required rejection reason if specified by the guide.
- Comments and audit timeline.
- Bulk-selection controls.
- Delegation management form/list.
- Notification bell and unread state.
- Clear error/success feedback.

### Employee interface

- Notification bell and unread state.
- Own request details and current approval stage.
- Own authorized comment thread.
- Final approval/rejection/cancellation updates.

### Frontend safety

- Do not rely on hidden buttons as authorization; server enforcement remains mandatory.
- Prevent accidental double-click submissions.
- Refresh or reconcile state after real-time updates.
- Keep keyboard accessibility, labels, mobile layout, and existing visual conventions intact.

---

## 9. Authentication, 2FA, and integration tests

Do not disable two-factor authentication in production.

Fix the integration-test login flow using one safe approach consistent with the repository:

1. Preferred: update the test helper to complete the existing two-factor challenge using a deterministic test OTP/provider; or
2. Add a strictly test-only bypass that works only when `NODE_ENV=test` and an explicit test flag is set.

A test bypass must:

- be impossible to activate in production;
- never accept a hardcoded universal code in normal environments;
- be covered by a test proving production mode still requires 2FA;
- be documented in `.env.example` without including a secret.

Do not change the production login response merely to make old tests pass.

---

## Database and migration expectations

Inspect the current schema before adding anything. Reuse existing tables and columns whenever they correctly support the requirements.

If a schema change is necessary:

- add a forward migration using the project's existing migration convention;
- make the migration safe for an existing development database;
- add indexes/unique constraints needed for authority checks, pending queues, reminder deduplication, or transactional safety;
- do not drop or rename unrelated member tables;
- do not insert real credentials;
- add/update deterministic M3 test fixtures for Employee, Supervisor, Manager, same-tier delegates, teams, leave balances, requests, comments, and notification preferences.

Seed/test identities must make the original approval chain explicit, for example:

- Team A employee;
- Team A Supervisor and another Supervisor who can temporarily act as delegate;
- Team A Manager and another Manager who can temporarily act as delegate.

Do not use cross-tier delegation in fixtures unless the official guide explicitly requires it.

---

# Required automated tests

Retain all valid existing tests and add or correct tests for the following.

## Approval state machine

- Supervisor can approve a pending-Supervisor request.
- Supervisor approval routes to the original Manager and does not deduct balance.
- Manager can finally approve a pending-Manager request.
- Final approval deducts the correct balance once.
- Repeated/concurrent final approvals do not double-deduct.
- Supervisor cannot perform final approval.
- Manager cannot bypass the Supervisor stage.
- Wrong-team approver is forbidden.
- Reject and cancel terminal-state behavior is correct.
- Invalid transition leaves database state unchanged.

## Coverage acknowledgement

- Flagged Manager approval fails without acknowledgement.
- It succeeds with acknowledgement.
- Non-Manager/direct API/bulk calls cannot bypass the rule.

## Delegation

- Valid same-tier delegation works during its active period.
- Future, expired, revoked, overlapping, self, and wrong-role delegation are rejected or inactive correctly.
- Delegate sees only covered requests.
- Delegate action keeps the employee's original approval chain.
- Audit records both actual actor and original approver.
- Singapore date/time boundary behavior is correct.

## AI-3

- Authorized original approver can request a summary.
- Authorized active delegate can request a summary.
- Wrong-team/non-delegated caller receives `403` without data leakage.
- OpenRouter success is parsed safely.
- Timeout, missing key, provider error, and malformed data produce the fallback.

## Notifications, reminders, and comments

- Correct recipients receive each workflow event.
- Cancellation notifies the current approver.
- In-app and email preferences are respected independently.
- Notification ownership is enforced.
- Employee can access their own notifications and request comments.
- Unauthorized user cannot access another request's comments.
- A request pending more than 24 hours produces one correct reminder.
- Re-running the job does not create duplicate reminders.
- Resolved/advanced requests do not receive stale reminders.

## Bulk actions and 2FA

- Bulk decisions enforce the same state machine and coverage rules.
- Mixed-result behavior is explicit and tested.
- Integration login correctly completes 2FA or uses the strict test-only path.
- Production configuration still enforces 2FA.

---

# Verification commands

Discover and use the repository's actual scripts rather than assuming command names. At minimum, run the applicable equivalents of:

1. dependency installation using the existing lockfile;
2. database migration/setup against a dedicated test database;
3. M3 unit tests;
4. M3 API/integration tests against MySQL;
5. the complete backend test suite;
6. frontend tests, if present;
7. lint/type checks, if configured;
8. server syntax/type validation;
9. React/frontend production build.

Do not report database-dependent tests as passed if they were skipped or could not connect. Clearly distinguish **passed**, **failed**, **skipped**, and **not runnable**.

If a command fails:

- diagnose the root cause;
- fix defects within M3 scope;
- rerun the smallest relevant test first;
- then rerun the broader suite to detect regressions.

---

# Manual end-to-end verification

After automated tests pass, verify this complete scenario with test data:

1. Employee submits a leave request.
2. The original Supervisor receives a real-time/persisted notification.
3. Supervisor opens the authorized pending queue.
4. Supervisor sees the AI-3 pattern, coverage strip, and advisory recommendation.
5. Supervisor adds a comment; the employee can see it and receives a notification.
6. Supervisor approves; balance remains unchanged and the request routes to the employee's original Manager.
7. Manager receives a notification.
8. For a coverage-flagged request, final approval is blocked until acknowledgement is ticked.
9. Manager acknowledges and finally approves.
10. Balance is deducted exactly once.
11. Employee receives the final notification and sees the updated status, comments, and timeline.
12. Repeat with an active same-tier delegate and prove that the original team/Manager chain does not change.
13. Advance a test request beyond 24 hours and prove that only one reminder reaches the correct current approver/delegate.

Capture concise evidence in the completion report; do not commit sensitive screenshots or credentials.

---

# Acceptance checklist

The work is complete only when all applicable items below are true:

- [ ] Presentation/guide and M3 documentation were read completely.
- [ ] Requirement-to-code traceability table was produced.
- [ ] Supervisor-to-Manager state transitions are enforced server-side.
- [ ] Balance changes only during successful final Manager approval.
- [ ] Final approval is atomic and protected against double deduction.
- [ ] Coverage exceptions require Manager acknowledgement on both UI and API.
- [ ] Same-tier delegation is consistently enforced unless the guide explicitly states otherwise.
- [ ] Delegated actions preserve the employee's original approval chain.
- [ ] Delegation uses Singapore business time and expires safely.
- [ ] AI-3 endpoints enforce request-level authority.
- [ ] AI failure produces a safe, useful fallback.
- [ ] Automated tests never call the real paid AI API.
- [ ] Employees can access their notifications and authorized comments.
- [ ] Notification preferences are respected.
- [ ] Cancellation notifies the responsible approver.
- [ ] More-than-24-hour reminders are correct and deduplicated.
- [ ] Bulk decisions reuse the same state machine and coverage rules.
- [ ] Audit history identifies delegated actors and original approvers.
- [ ] Integration tests work with 2FA without weakening production security.
- [ ] All applicable unit/integration/frontend tests pass against the dedicated test database.
- [ ] Production frontend build passes.
- [ ] No secret is hardcoded or committed.
- [ ] Existing non-M3 functionality has no detected regression.

---

# Required final deliverables

In addition to the code changes, create or update these repository artifacts where appropriate:

1. Database migration(s), if required.
2. M3 unit and MySQL integration tests.
3. Deterministic M3 test fixtures/seed data.
4. `.env.example` containing placeholders only.
5. A concise `M3_COMPLETION_REPORT.md` containing:
   - requirement traceability table;
   - defects found and fixes made;
   - files changed and why;
   - migrations and new environment variables;
   - exact verification commands;
   - test/build results with pass/fail/skip counts;
   - manual demo accounts/roles using non-secret identifiers only;
   - any remaining limitation, if one genuinely remains.

At the end of your work, respond with:

- a brief completion summary;
- the most important implementation decisions;
- database/configuration steps the developer must run;
- exact test results;
- the recommended M3 presentation/demo sequence;
- any unresolved blocker stated honestly.

Do not stop after writing a plan. Proceed through inspection, implementation, testing, and the completion report. Ask a question only if a missing decision from the official assignment materials would materially change the implementation and cannot be resolved safely from the repository.
