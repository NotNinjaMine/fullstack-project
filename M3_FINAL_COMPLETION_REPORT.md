# M3 Final Completion Report

**Date:** 6 August 2026  
**Timezone:** Asia/Singapore (UTC+08:00)  
**Project:** Annual Leave Management System  
**Scope:** Member 3 — approval, delegation, notifications, comments, reminders/escalations, audit timeline, AI-3, final email-domain/toast corrections, and verification

## 1. Final status and evidence classification

The source project has been completed to the extent that this workspace could execute safely. Results are classified as follows:

| Classification | Result |
|---|---|
| **Fixed and verified** | Duplicate final-approval toast orchestration; same-frame approval/comment/delegation/leave-submission guards; leave-submission idempotency-key validation; demo-email migration planning and collision detection; SMTP test redirect rules; sanitized mailer errors; backend/client syntax; 12 backend unit suites; 5 client regression tests. |
| **Implemented and statically inspected** | Two-tier approval, transactional final deduction, coverage acknowledgement, delegation routing, full-chain comments, comment audit records, notification fan-out, reminder deduplication, team schedule, AI-3 authorization/fallback, 2FA/password reset, and the MySQL integration scenarios. |
| **Blocked by demonstrated environment restriction** | Real MySQL seed/migration/integration/E2E execution because no MySQL service listened on `127.0.0.1:3306`; Vite production build because the uploaded Windows dependency tree lacked Rollup’s Linux native package and the configured npm mirror returned 404 for that package and the public registry hostname could not be resolved. |
| **Manual evidence supplied by the developer** | Gmail SMTP previously delivered a Manager-review email to `diana@wypledu.online`; an approval email addressed to stale `kumar@innovare.example.test` was accepted for sending but later bounced; password reset previously reached a controlled `@wypledu.online` mailbox. |
| **Not executed in this workspace** | Live Gmail SMTP authentication/send and live OpenRouter calls. Credentials previously posted in chat are exposed and must be rotated, and this workspace has restricted outbound access. No exposed credential was reused. |

A Jest integration file can show many failed test names when its `beforeAll` database connection fails. In the final run, all 35 MySQL scenarios were blocked before scenario logic ran; they are **not** reported as 35 product defects.

## 2. Defects from the uploaded evidence

### 2.1 Duplicate final-approval toast

The original UI result was being rendered through two temporary-feedback paths for one committed decision. The corrected flow uses only `react-hot-toast` for approval results and a stable deduplication ID:

```text
leave-final-approval-<requestId>
```

The production decision flow is now centralized in `submitLeaveDecision()`:

1. one `PUT /leave/:id/decide` request;
2. one response-status interpretation;
3. one `publishDecisionToast()` call;
4. one canonical success message.

A synchronous single-flight ref prevents two clicks in the same React render frame. The persistent database notification to the employee remains separate and was not removed.

### 2.2 Stale company recipient domain

The new screenshots prove that the source seed/domain change alone was insufficient: an existing database row still contained `kumar@innovare.example.test`, so final approval sent to the stale address and Gmail later returned an address-not-found bounce.

The final correction now covers both historical suffixes:

```text
@innovare.com
@innovare.example.test
```

and maps active demo staff in place to:

```text
@wypledu.online
```

The migration preserves user IDs and all leave/balance/delegation relationships. It detects collisions against **all** accounts, including inactive accounts that still own unique email addresses.

### 2.3 Rapid duplicate leave submission

The employee form now sends an opaque `Idempotency-Key` and uses a synchronous frontend lock. The backend stores `submissionKey` on `leave_requests` with a composite unique index on employee + key. A retry with the same key returns the original request and does not repeat audit or notification side effects.

This is additive and backward-compatible: older clients without the header continue to work.

## 3. M3 requirements status

| Requirement | Source status | Executed verification |
|---|---|---|
| Supervisor → Manager state machine | Implemented; current tier and authorization are revalidated inside decision transactions. | Unit/static verified; MySQL integration blocked. |
| Balance deduction after final approval only | Implemented with request and balance row locks; concurrent final-approval test exists. | Transaction-boundary unit tests passed; MySQL concurrency test blocked. |
| Coverage exception acknowledgement | Individual Manager approval requires explicit acknowledgement; flagged requests excluded from bulk actions. | Approval-rule unit tests passed; MySQL cases blocked. |
| Delegation/acting approver | Active same-tier, date-bounded delegation; original employee approval chain is preserved. | Delegation unit tests passed; DB lifecycle cases blocked. |
| In-app notifications | Preference-aware, recipient-resolved, post-commit delivery. | Notification unit tests passed; DB row counts blocked. |
| Email notifications | Shared best-effort mailer; independent email preference; sanitized failures; no transaction rollback. | Mailer unit tests passed; manual screenshots partial; live rerun not executed. |
| Comments/rejection reasons | Authorized full-chain discussion, mandatory rejection reasons, atomic comment + audit. | Unit/static verified; MySQL cases blocked. |
| 24-hour reminders/escalation behavior | Stage-relative recipient claim and deduplication retained. | Business-time/notification unit tests passed; MySQL job cases blocked. |
| Audit timeline | Decisions and comments use append-only audit records; comment text is not copied to audit action. | Transaction unit tests passed; DB audit rows blocked. |
| Team schedule R1 | Authorization-safe team calendar including active delegated-team context. | Client/backend syntax passed; DB cases blocked. |
| AI-3 | Request-level authorization, advisory-only output, timeout/provider fallback. | AI client unit tests passed; live OpenRouter call not executed. |
| Authentication regression | 2FA and one-time reset-token logic preserved; production demo-code guard exists. | Source/unit inspected; DB/E2E flow blocked. |

## 4. Database-domain safeguards

### 4.1 Explicit migration

Run against the authorized **development** database:

```bash
cd server
npm run migrate:demo-emails -- --confirm=wypledu.online
npm run verify:demo-emails
```

The migration:

- refuses `NODE_ENV=test` and `NODE_ENV=production`;
- changes only active users on recognized legacy demo domains;
- preserves each local part and user ID;
- locks rows and runs in one transaction;
- detects normalized duplicates and target collisions;
- is safe to rerun;
- prints counts only.

### 4.2 Seed and startup protection

`server/seed.js` repairs stale legacy rows before `findOrCreate` runs. This prevents creation of a new `@wypledu.online` user while old leave requests remain attached to a legacy user.

`server/index.js` refuses to start when active legacy recipient rows remain. This turns a silent email bounce into an actionable database correction.

### 4.3 Additive schema change

`leave_requests.submissionKey` is nullable and has a composite unique index with `employeeId`. Existing rows remain valid because their key is `NULL`.

## 5. SMTP and OpenRouter handling

### SMTP

- Real credentials remain environment-only.
- Existing Gmail SMTP sender configuration is not replaced by the staff recipient domain.
- `EMAIL_TEST_MODE=false` by default.
- Optional development-only redirect can send intended staff event emails to one controlled inbox without changing production routing.
- Production ignores the redirect even if configured accidentally.
- Mailer results/logs mask or omit sensitive recipient/provider details.
- Provider failure returns a sanitized result and cannot roll back a committed leave action.

### OpenRouter

- Key remains backend-only.
- AI output is advisory and cannot approve/reject leave.
- Timeout/provider/malformed-response paths use deterministic fallback.
- Unit tests passed with provider calls mocked/disabled.
- No live request was made using a key previously exposed in chat.

## 6. Exact commands and results

### Passed

```text
server: npm run check
Result: PASS — syntax OK for 85 JavaScript files.

server: npm run test:unit -- --runInBand
Result: PASS — 12/12 suites, 86/86 tests, 0 failures.

client: npm test
Result: PASS — 5/5 tests, 0 failures.

client: npm run check
Result: PASS — syntax OK for 18 JavaScript/JSX files.
```

### Blocked with exact evidence

```text
server: npm run seed:test
Result: BLOCKED — SequelizeConnectionRefusedError,
        connect ECONNREFUSED 127.0.0.1:3306.

server: npm run test:m3 -- --runInBand
Result: BLOCKED in beforeAll — 1 suite/35 scenarios could not start because
        db.sequelize.sync({ alter: true }) received ECONNREFUSED 127.0.0.1:3306.

server: npm test -- --runInBand
Result: 12 unit suites / 86 tests passed; the one MySQL suite was blocked.
        Jest summary: 12 suites passed, 1 setup-blocked; 86 tests passed,
        35 reported failed because beforeAll could not connect.

server: npm run verify:demo-emails
server: npm run migrate:demo-emails -- --confirm=wypledu.online
Result: BLOCKED — connect ECONNREFUSED 127.0.0.1:3306.

client: npm run build
Result: BLOCKED — Cannot find module @rollup/rollup-linux-x64-gnu.
        The uploaded node_modules was Windows-targeted; the internal npm mirror
        returned 404 for @rollup/rollup-linux-x64-gnu@4.62.2, and the public
        registry hostname could not be resolved from this container.

MySQL installation fallback
Result: BLOCKED — no MySQL/MariaDB package was installed and the Debian
        repository update did not complete in this restricted environment.
```

## 7. Manual email evidence: what it proves and does not prove

| Evidence | Interpretation |
|---|---|
| Manager-review email to `diana@wypledu.online` | Confirms a Manager-stage template reached that controlled/provisioned mailbox over TLS. |
| Final-approval email addressed to `kumar@innovare.example.test` | Confirms the business event attempted an employee email but the development DB still had a legacy recipient. |
| Mail Delivery Subsystem bounce | Confirms recipient/domain failure, not necessarily SMTP authentication failure. |
| Earlier password-reset delivery to a controlled `@wypledu.online` mailbox | Confirms prior SMTP connectivity and one working mailbox; it does not prove all aliases or every M3 event. |

No raw reset token, SMTP password, API key, or unredacted secret screenshot is included in the final package.

## 8. Files changed in the final workspace

### Frontend

- `client/src/pages/Approver.jsx`
- `client/src/pages/Employee.jsx`
- `client/src/components/CommentThread.jsx`
- `client/src/components/DelegationPanel.jsx`
- `client/src/lib/decisionFeedback.js`
- `client/tests/decisionFeedback.test.js`
- `client/scripts/checkSyntax.cjs`
- `client/package.json`
- `client/.gitignore`

### Backend

- `server/index.js`
- `server/seed.js`
- `server/models/LeaveRequest.js`
- `server/routes/leaveRequest.js`
- `server/services/mailer.js`
- `server/services/demoEmailMigration.js`
- `server/services/submissionIdempotency.js`
- `server/scripts/migrateDemoEmails.js`
- `server/scripts/verifyDemoEmails.js`
- `server/tests/mailer.test.js`
- `server/tests/demoEmailMigration.test.js`
- `server/tests/submissionIdempotency.test.js`
- `server/tests/api.m3.integration.test.js`
- `server/package.json`
- `server/.env.example`
- `server/.gitignore`

### Documentation and packaging

- `.gitignore`
- `README.md`
- `server/README.md`
- `M3_FINAL_COMPLETION_REPORT.md`
- `M3_EMAIL_NOTIFICATION_REPORT.md`
- `M3_TESTING_AND_DEMO_GUIDE.md`
- `M3_FINAL_VERIFICATION_REPORT.md`

## 9. Security and packaging verification

Before packaging, the source tree was scanned while excluding local environment files and dependency/build directories. No high-confidence exposed OpenRouter key, SMTP app password, private key, JWT, or reset-token pattern was found in the distributable source. Current demo-account source files contain no applicable legacy company address; the only legacy-domain references are migration logic, migration tests, and historical evidence in reports.

The final archive excludes `.env`, `.env.test`, `node_modules`, logs, build output, coverage output, screenshots, and previous ZIP files. Demo seed credentials that are intentionally part of the existing classroom application are not treated as real development secrets, and the seed command no longer prints a password in terminal output.

The archive integrity check passed. It contains all required server/client/report/migration entries, with zero excluded-entry violations, zero high-risk credential/token patterns, and zero exact matches for distinctive local secrets from the excluded environment files.

## 10. Remaining local verification checklist

These items require a machine with a running MySQL server, freshly rotated credentials, and normal outbound access:

1. Create/verify `leave` and `leave_test`, grants, and application account.
2. Run the email migration and prove zero active legacy rows.
3. Run `seed:test`, `test:m3`, and the full Jest suite.
4. Reinstall client dependencies on the target operating system and run the Vite build.
5. Start backend and frontend; verify one final-approval toast in the browser/network panel.
6. Execute the live M3 email event matrix using authorized inboxes or development redirect.
7. Perform one controlled live OpenRouter advisory request with a newly rotated key.

Until those steps run, database, full E2E, live SMTP, and live OpenRouter remain honestly classified as blocked/manual verification required.
