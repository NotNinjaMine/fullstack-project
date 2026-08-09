# M3 Completion Report

Date: 2026-08-04 (Asia/Singapore)

Scope: Member 3 — Approval, Delegation, Notifications, Comments, and AI-3.

## Outcome

T1 through T10 were implemented in the prescribed order. The runnable unit tests, server syntax checks, and client production build pass. Database seeding and the MySQL-backed integration suite could not run in this environment because no MySQL service is reachable; those checks are reported as **not runnable**, not as behavioural test failures.

The compromised OpenRouter key was not copied into the project, tests, documentation, logs, or deliverable. Account-side key rotation remains an external action because the OpenRouter key page redirects to sign-in and no authenticated session was available.

## Traceability

| Task | Implementation | Verification evidence |
|---|---|---|
| T1 — atomic final approval | `decideOne` now runs in a Sequelize transaction, locks and reloads the request, rechecks authority and stage, locks the employee balance, and commits the status, balance deduction, audit, and optional decision comment once. Notifications run only after commit. | Unit approval-rule coverage passes. MySQL integration test added for two concurrent Manager approvals and one balance deduction; DB execution not runnable here. |
| T2 — AI request authorization | AI summary and draft-note load the request/employee, resolve active delegations using the business date, and call `canActOn`. Wrong-team users receive 403 with an empty response body. | MySQL integration tests added for wrong-team denial and active-delegate access; DB execution not runnable here. |
| T3 — hosted LLM timeout/fallback | Added a mockable LLM client with `AbortController`, bounded `LLM_TIMEOUT_MS`, response validation, safe errors, and deterministic service fallbacks. Supports existing OpenAI-compatible/OpenRouter and Anthropic configuration. | `aiClient.test.js`: 8/8 passing, covering success, provider error, timeout/abort, malformed responses, parsing, and fallbacks. |
| T4 — original-team approval chain | Approval routing and queue selection always use the leave employee's original team. A delegate can act for the original approver without transferring the chain to the delegate's team. Legacy `routedTeam` is ignored. | Unit routing test passes. MySQL integration test added for Aiden acting for Marcus followed by Grace remaining the original Team B Manager; DB execution not runnable here. |
| T5 — delegation lifecycle | All business-date comparisons use `APP_TIMEZONE`; creation enforces active users, same-tier roles, and overlap/conflict checks. Added acting-for audits, transactional revoke, hourly expiry, and one-time revoke/expiry notifications. | Business-time boundary and delegation-rule unit tests pass. MySQL overlap/revoke/chain tests added; DB execution not runnable here. |
| T6 — notification preferences/cancellation | `notify()` independently respects `notifyInApp` and `notifyEmail`; mail errors are best-effort and safely logged. Cancellation now notifies the responsible current-stage approver or delegate. | Notification preference tests: in-app only, email only, both off, and safe mail failure all pass. Cancellation integration coverage added; DB execution not runnable here. |
| T7 — stage-scoped 24-hour reminders | Added `stageEnteredAt` and `lastReminderKey`. Every stage transition resets reminder state. Reminder age uses stage entry, recipients resolve through current active delegation, and a row-locked stage/recipient key prevents duplicates. | Five reminder unit cases pass, including exact 24 hours, recent stage entry, terminal state, matching key, and one millisecond early. Delegate/dedup integration coverage added; DB execution not runnable here. |
| T8 — Employee notifications/comments | Moved one notification bell into the shared authenticated header. Added an Employee request-details modal with the existing comment thread; terminal requests remain visible with comments locked. | Vite production build passes. |
| T9 — bulk rejection reason/transactions | Bulk rejection now requires a trimmed reason of at least five characters. Each request uses its own transaction and records the reason as a decision comment; results expose only per-request status/message data. | MySQL integration coverage added for missing/valid reason and independent request transactions; DB execution not runnable here. Client build confirms bulk reason modal wiring. |
| T10 — integration 2FA/same-tier fixtures | Login helper now completes send-and-verify 2FA. Demo codes are test/non-production only and OTP values are never logged. A13/A15/A16 now use Aiden (SUP, Team B) or Grace (MGR, Team B) as same-tier fixtures. | Production-mode integration case asserts no direct token and no demo code. All 25 integration cases are present but DB execution is not runnable here. |

## Defects found and fixed

- Repaired the broken `server/package.json` script/test references by adding `scripts/checkSyntax.js`, `tests/approvalRules.test.js`, and `tests/aiClient.test.js` and including the new focused suites in `test:unit`.
- Prevented stale concurrent approvals and duplicate balance deductions with request/balance row locks and transactional revalidation.
- Closed cross-team AI authorization gaps without leaking response details on 403.
- Isolated hosted-AI transport behind a mockable client and added timeout, output validation, sanitized errors, and fallback tests.
- Removed delegate-team rerouting while retaining legitimate acting-for authority.
- Corrected UTC/business-date boundary behaviour and delegation lifecycle validation/auditing/notification gaps.
- Made notification channels obey user preferences independently and restored cancellation notifications.
- Made reminders stage-relative, delegation-aware, stage/recipient-scoped, and concurrency-deduplicated.
- Restored Employee notification and comment access.
- Made bulk rejection reasons mandatory and transactionally recorded per request.
- Repaired integration authentication so tests exercise the actual 2FA flow without weakening production behaviour.

## Additive schema changes

No migration files were added. `sequelize.sync({ alter: true })` will add:

- `Delegation.revokedAt`
- `Delegation.expiryNotifiedAt`
- `LeaveRequest.stageEnteredAt`
- `LeaveRequest.lastReminderKey`

## Files changed and why

| File | Reason |
|---|---|
| `server/package.json` | Repaired scripts and expanded the focused unit-test command. |
| `server/scripts/checkSyntax.js` | Added the missing recursive `node --check` runner. |
| `server/index.js` | Starts the delegation expiry lifecycle scheduler. |
| `server/models/Delegation.js` | Added revocation and expiry-notification timestamps. |
| `server/models/LeaveRequest.js` | Added stage-entry and stage-scoped reminder fields; documented legacy routing. |
| `server/routes/leaveRequest.js` | Atomic approvals, original-team queues, notification routing, cancellation alerts, stage timestamps, and reasoned bulk rejection. |
| `server/routes/ai.js` | Request-level RBAC/delegation checks and stage-relative waiting time. |
| `server/routes/delegation.js` | Business-date, active/same-tier/overlap validation, transactional audits, and revoke notification. |
| `server/services/ai.js` | Uses the mockable hosted-client boundary and deterministic fallbacks. |
| `server/services/llmClient.js` | Added hosted-provider configuration, timeout, validation, and safe error handling. |
| `server/services/delegationService.js` | Correct business-date comparison and original-team routing. |
| `server/services/delegationLifecycleService.js` | Added idempotent expiry, audit, notifications, and scheduler. |
| `server/services/notificationService.js` | Preference gating, delegate-aware recipients, and stage-scoped reminder claiming. |
| `server/services/twoFactorService.js` | Restricted demo codes to non-production and removed OTP logging. |
| `server/tests/approvalRules.test.js` | Added missing authority/original-team unit coverage. |
| `server/tests/aiClient.test.js` | Added hosted-AI success/error/timeout/malformed/fallback coverage. |
| `server/tests/businessTime.test.js` | Added Singapore midnight-boundary coverage. |
| `server/tests/notificationPreferences.test.js` | Added independent channel-preference and safe-failure coverage. |
| `server/tests/notificationService.test.js` | Added exact, stage-relative, terminal, and dedup reminder cases. |
| `server/tests/api.m3.integration.test.js` | Completed 2FA login and added T1–T10 API scenarios with valid same-tier fixtures. |
| `client/src/App.jsx` | Added the shared authenticated notification bell. |
| `client/src/pages/Employee.jsx` | Added request details and comment thread. |
| `client/src/pages/Approver.jsx` | Original-stage wait display and required bulk rejection reason flow. |
| `client/src/pages/Admin.jsx` | Removed duplicate notification bell after moving it to the shared header. |
| `client/src/components/RejectReasonModal.jsx` | Added bulk-count copy while preserving reason validation. |

Dependency lockfiles were not hand-edited; the requested `npm install` commands produced no lockfile diff. Generated `node_modules`, client `dist`, `.env`, and `.env.test` are excluded from the deliverable archive.

## Environment variables

No new environment variables were introduced. The implementation uses variables already documented in `.env.example`, including:

- `APP_TIMEZONE` for business dates (Singapore by default)
- `LLM_TIMEOUT_MS` for the hosted-AI timeout
- existing hosted-provider URL/model/key variables
- `TWO_FACTOR_MODE`; production additionally enforces the no-demo-code rule through `NODE_ENV=production`

Local `.env` and `.env.test` files were recreated from examples. The test file targets `DB_NAME=leave_test` with `NODE_ENV=test`; neither file is included in the archive.

## Verification results

### Passed

| Command | Result |
|---|---|
| `cd server && npm install` | Completed; existing dependencies installed, no runtime dependency added. |
| `cd client && npm install` | Completed; existing dependencies installed. |
| `cd server && npm run test:unit -- --runInBand` | 7/7 suites, 46/46 tests passed. |
| `cd server && npm run check` | Syntax OK for all 74 server JavaScript files. This invokes `node --check` on every touched server JavaScript file and the rest of the server tree. |
| `cd client && npm run build` | Passed with Vite 5.4.21; 1,856 modules transformed. |

### Failed

No behavioural failure was observed in a runnable test or build.

### Skipped

No requested runnable check was intentionally skipped.

### Not runnable in this environment

| Command | Result |
|---|---|
| `cd server && npm run seed:test` | Exited 1 with `SequelizeConnectionRefusedError` / `ECONNREFUSED`; no MySQL service is reachable. |
| `cd server && npx jest tests/api.m3.integration.test.js --runInBand` | The shared database setup could not connect, so the 25 integration cases did not execute their test bodies. |
| `cd server && npx jest --runInBand` | Raw Jest summary: 7 suites passed, 1 DB suite stopped; 46 tests passed and 25 were reported failed solely because shared `beforeAll` could not connect (71 total). |
| Browser/manual end-to-end scenarios | Require a running MySQL-backed server and therefore were not runnable here. |

To complete database verification locally:

```bash
cd server
# Configure the gitignored .env.test for a reachable dedicated leave_test schema.
npm run seed:test
npx jest --runInBand
cd ../client
npm run build
```

## Demo accounts (identifiers only)

| Identifier | Role/team |
|---|---|
| `weiling@wypledu.online` | Employee, Team A |
| `marcus@wypledu.online` | Supervisor, Team A |
| `diana@wypledu.online` | Manager, Team A |
| `aiden@wypledu.online` | Supervisor, Team B |
| `grace@wypledu.online` | Manager, Team B |
| `hr@wypledu.online` | HR Admin |

No passwords, API keys, database credentials, or connection strings are included in this report.

## Genuine remaining limitations

1. MySQL-backed schema synchronization, seeding, and all 25 API integration scenarios still require execution against a reachable dedicated `leave_test` database.
2. OpenRouter account-side rotation remains pending. Sign in at `https://openrouter.ai/sign-in?redirect_url=https%3A%2F%2Fopenrouter.ai%2Fworkspaces%2Fdefault%2Fkeys`, revoke the compromised credential, create a fresh credential, and store it only in the gitignored local `server/.env` or a secret manager.
3. Provider email/SMS and hosted-AI delivery remain best-effort external integrations; automated tests use mocks and do not contact providers.
