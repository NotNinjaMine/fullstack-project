# M3 Testing and Demo Guide

**Project:** Annual Leave Management System  
**Scope:** M3 Approval, Delegation, Notifications, Comments, Team Schedule, Reminders, and AI-3  
**Timezone:** Asia/Singapore

## 1. Prerequisites

Install and confirm:

- Node.js and npm compatible with the project lockfiles.
- MySQL running locally or on an authorized test host.
- A dedicated empty test schema named with `test`, such as `leave_test`.
- A limited MySQL application/test account with access only to the required development and test schemas.
- Two terminal windows for the server and client.
- An authorized browser session for the demonstration.

Do not use MySQL root from the application. Do not put any real secret in source, Markdown, screenshots, chat, or the ZIP.

## 2. Safe environment setup

### 2.1 Development configuration

Create `server/.env` locally from `server/.env.example`. Keep it gitignored.

Use placeholders as a checklist:

```dotenv
APP_PORT=3001
CLIENT_URL=http://localhost:3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=<limited-development-user>
DB_PWD=<local-development-password>
DB_NAME=leave
APP_SECRET=<long-random-development-secret>
APP_TIMEZONE=Asia/Singapore
TWO_FACTOR_MODE=always
LLM_TIMEOUT_MS=8000
OPENAI_API_KEY=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
```

Leave hosted-AI keys blank to demonstrate deterministic fallback. Add SMTP settings only when authorized to send real email.

For real email verification, add the following values to `server/.env` only:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<authorized-sender-email>
SMTP_PASS=<app-password-entered-manually>
SMTP_FROM_NAME=Annual Leave Management System
SMTP_FROM_EMAIL=<authorized-sender-email>
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=15000
```

For Gmail, enable two-step verification on the authorized sender account and create a Gmail App Password. Use that App Password in `SMTP_PASS`; do not use the normal Gmail password. Never paste either value into source, tests, screenshots, this guide, or chat. Port `587` with `SMTP_SECURE=false` uses STARTTLS. After editing `server/.env`, restart the server.

### 2.2 Dedicated test configuration

Create `server/.env.test` locally. It is gitignored and must not be packaged.

```dotenv
NODE_ENV=test
APP_PORT=3002
CLIENT_URL=http://localhost:3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=<limited-test-user>
DB_PWD=<local-test-password>
DB_NAME=leave_test
APP_SECRET=<long-random-test-secret>
APP_TIMEZONE=Asia/Singapore
TWO_FACTOR_MODE=always
OPENAI_API_KEY=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
SMTP_ENABLED=false
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

The test guard rejects a missing database, `DB_NAME=leave`, or a database name that does not contain `test`.

### 2.3 Create the schemas safely

Run as an authorized MySQL administrator, replacing placeholders locally:

```sql
CREATE DATABASE IF NOT EXISTS `leave`;
CREATE DATABASE IF NOT EXISTS `leave_test`;

CREATE USER IF NOT EXISTS '<limited-user>'@'localhost'
IDENTIFIED BY '<local-password>';

GRANT ALL PRIVILEGES ON `leave`.* TO '<limited-user>'@'localhost';
GRANT ALL PRIVILEGES ON `leave_test`.* TO '<limited-user>'@'localhost';
FLUSH PRIVILEGES;
```

Expected result: both schemas exist, and the application account can connect without using root.

## 3. Install, seed, and verify

### 3.1 Server

```bash
cd server
npm install
npm run check
npm run test:unit -- --runInBand
npm run seed:test
npm run test:m3 -- --runInBand
npm test -- --runInBand
```

Expected results for this final source revision:

1. `npm install` completes using dependencies for the current operating system.
2. `npm run check` reports syntax success for 85 server JavaScript files.
3. `npm run test:unit` executes 12 suites / 86 unit tests.
4. `npm run seed:test` explicitly names the dedicated test schema and succeeds.
5. `npm run test:m3` executes 35 MySQL integration scenarios.
6. `npm test` executes 121 declared tests in total (86 unit + 35 integration).

Record the actual pass/fail counts from your machine. A database connection failure in `beforeAll` causes all integration names to appear failed even though no scenario body ran; classify that as a setup blocker, not as many feature defects.

### 3.2 Client

```bash
cd client
npm install
npm test
npm run check
npm run build
```

Expected results:

- 5/5 duplicate-toast/single-flight regression tests pass.
- syntax parsing succeeds for 18 JavaScript/JSX files.
- Vite finishes a production build with exit code 0 and creates `dist/`.

Install dependencies on the same operating system that runs the build. Do not copy a Windows `node_modules` directory into Linux or vice versa. Do not include `dist/` in the final ZIP.

## 4. Start the development application

Terminal 1:

For an existing development database that may still contain legacy staff addresses, run the explicit idempotent migration once before seeding:

```bash
cd server
npm run migrate:demo-emails -- --confirm=wypledu.online
npm run verify:demo-emails
npm run seed
npm start
```

The migration updates only `ACTIVE` users whose email ends in `@innovare.com` or the earlier reserved demo suffix `@innovare.example.test`. It preserves each local part and user ID, checks target ownership across all account statuses, runs in one transaction, and refuses `NODE_ENV=test` or `NODE_ENV=production`. On a fresh database it reports zero updated rows safely. Seeding repeats the repair before creating demo accounts, and server startup refuses active legacy recipients.

Terminal 2:

```bash
cd client
npm run dev
```

Expected result:

- Server starts on the configured API port.
- Client starts on the Vite URL shown in the terminal.
- Browser login always enters the two-step verification flow.
- No access token is returned immediately after only the password step.

## 5. Demo account identifiers

Use the authorized local credentials managed by the team. Do not place passwords in this guide or a recording.

| Identifier | Role | Team / country note |
|---|---|---|
| `weiling@wypledu.online` | Employee | Team A, SG |
| `priya@wypledu.online` | Employee | Team A, SG |
| `kumar@wypledu.online` | Employee | Team A, SG |
| `faridah@wypledu.online` | Employee | Team A, SG |
| `linh@wypledu.online` | Employee | Team A, VN calendar/policy |
| `somchai@wypledu.online` | Employee | Team A, TH calendar/policy |
| `marcus@wypledu.online` | Supervisor | Team A |
| `diana@wypledu.online` | Manager | Team A |
| `aiden@wypledu.online` | Supervisor | Team B |
| `grace@wypledu.online` | Manager | Team B |
| `hr@wypledu.online` | HR Admin | HR/Audit |

## 6. Demonstration sequence

For clean evidence, use a new request in each scenario and record its `REQ-<id>` reference.

### Scenario 1 — Normal two-tier approval

1. Sign in as `weiling@wypledu.online` and complete 2FA.  
   **Expected:** Employee dashboard opens; no token was issued before the verification step.
2. Submit an unflagged annual-leave request. Double-click the submit button rapidly once during controlled testing.  
   **Expected:** Status is `PENDING_SUPERVISOR`; the balance is not deducted; Supervisor notification is created according to preferences; the client sends one opaque `Idempotency-Key`, and only one request/audit event exists for that employee/key.
3. Sign in as `marcus@wypledu.online`. Open the request’s AI-3 summary.  
   **Expected:** Pattern, coverage, historical/advisory information and the human-responsibility disclaimer display; no automatic decision occurs.
4. Post a Supervisor comment.  
   **Expected:** Comment appears once, a matching comment audit row exists, and Employee plus Manager are notified; the Supervisor does not notify themself.
5. Approve as Supervisor.  
   **Expected:** Status becomes `PENDING_MANAGER`; balance remains unchanged; audit records Supervisor approval; Manager/delegate is notified.
6. Keep the Supervisor session and reopen the thread.  
   **Expected:** Original Supervisor can still read and post at Manager stage.
7. Sign in as `diana@wypledu.online`, post a Manager comment, and approve.  
   **Expected:** Status becomes `APPROVED`; balance `used` increases exactly once; employee is notified; Manager decision and comment audits are visible. Exactly **one** temporary success toast appears for the final decision; it is not overlapped by the application-level notification prompt.
8. Refresh all views.  
   **Expected:** Approved dates appear on the team schedule; thread remains readable but the post box is locked.

### Scenario 2 — Coverage exception

1. Submit or prepare a request that becomes `flagged=true`.  
   **Expected:** Request displays the coverage warning.
2. Approve as Supervisor.  
   **Expected:** It routes to `PENDING_MANAGER`; it is not finally approved.
3. Open the Manager queue.  
   **Expected:** Bulk checkbox is disabled and labelled as requiring individual coverage-exception review.
4. Attempt individual approval without checking acknowledgement.  
   **Expected:** Server returns a validation error; status and balance remain unchanged.
5. Tick the explicit acknowledgement and approve individually.  
   **Expected:** Request becomes `APPROVED`; balance deducts once; audit states that the Manager explicitly approved the coverage exception.

### Scenario 3 — Rejection and mandatory reason

1. Open a pending request as the responsible Supervisor or Manager.
2. Attempt rejection with an empty or too-short reason.  
   **Expected:** UI/server blocks the action; no status, comment, audit, or notification change occurs.
3. Submit a valid reason.  
   **Expected:** Status becomes `REJECTED`; the reason is stored in the correct tier note; Employee is notified; decision audit is visible.
4. For a bulk rejection, select only eligible unflagged requests and provide one valid reason.  
   **Expected:** Each successful item has its own transaction, decision comment, and comment audit. A failed item has none.

### Scenario 4 — Delegation and acting approver

1. Sign in as `aiden@wypledu.online` and create an active Supervisor → Supervisor delegation to `marcus@wypledu.online` for a current Singapore business-date range.  
   **Expected:** Delegation is accepted; both relevant users receive the configured notification; create audit exists.
2. Sign in as `marcus@wypledu.online`.  
   **Expected:** Pending Team B Supervisor requests appear with `Acting for Aiden` context.
3. Open the Approver team schedule and choose Team B.  
   **Expected:** Team B appears only because the delegation is active; the schedule shows `Acting for Aiden`; no leave reason/type/attachment appears.
4. Post a comment and approve a Team B Supervisor-stage request.  
   **Expected:** Acting-for context appears in audit; original Team B Manager remains the final approval chain.
5. Confirm the original Supervisor can still view the request/thread.  
   **Expected:** Delegation adds authority but does not remove original visibility.
6. Revoke the delegation.  
   **Expected:** Revoke audit/notification is created once; Team B disappears from Marcus’s authorized selector/queue; subsequent direct access returns `403`.
7. Repeat with Manager → Manager using the Team B and Team A Managers.  
   **Expected:** Same-tier rule is enforced; cross-tier/self/inactive/overlapping attempts are rejected.

### Scenario 5 — Shared comment thread and notification fan-out

Use one pending request and check notification counts after each post.

1. Employee posts.  
   **Expected:** Original Supervisor, original Manager, and any active delegates are notified once; Employee is excluded.
2. Original Supervisor posts at Manager stage.  
   **Expected:** Employee, original Manager, and applicable active delegates are notified; Supervisor is excluded.
3. Original Manager posts while pending.  
   **Expected:** Employee, original Supervisor, and applicable active delegates are notified; Manager is excluded.
4. Try a wrong-team Supervisor and Manager.  
   **Expected:** `403`; no comment, audit, or notification is created.
5. Open as HR Admin.  
   **Expected:** Read succeeds; post returns `403`.
6. Make a terminal decision.  
   **Expected:** Employee, original approvers, active authorized delegates, and HR can still read as applicable; every post attempt is rejected.

### Scenario 6 — Flagged request exclusion from bulk actions

1. Place one flagged and one unflagged request at the same Manager stage.
2. Observe the UI.  
   **Expected:** Only the unflagged item can be selected.
3. Call bulk approval with both IDs using an API client and even include `acknowledgeException=true`.  
   **Expected:** Flagged item returns `Coverage-flagged requests require individual Manager review.`; unflagged item processes independently.
4. Repeat bulk rejection with both IDs.  
   **Expected:** Flagged item is still excluded.
5. Inspect the flagged item.  
   **Expected:** Its status, balance, decision audit, decision comment, and final notification are unchanged.

### Scenario 7 — 24-hour reminder

Use only the dedicated test database or an authorized disposable fixture.

1. Set a pending request’s current `stageEnteredAt` to slightly more than 24 hours ago and clear its reminder key.
2. Run the HR reminder endpoint or configured reminder sweep.  
   **Expected:** The current-stage original approver and any active same-tier delegate are notified; no request state changes.
3. Run the sweep immediately again.  
   **Expected:** No duplicate for the same request, stage, and recipient. If a new delegate becomes responsible later in the same stage, only that newly added recipient receives the outstanding reminder.
4. Move Supervisor stage to Manager stage and set the new stage time to less than 24 hours ago.  
   **Expected:** Old-stage reminder does not fire; stage age has reset.
5. Resolve the request and run again.  
   **Expected:** No terminal reminder is created.

### Scenario 8 — Notification center and preferences

1. Open the shared notification bell as each authenticated role.  
   **Expected:** Only that user’s rows are shown; unread count matches their rows.
2. Attempt to mark another user’s notification as read through an API client.  
   **Expected:** `403`.
3. Test in-app on/email off.  
   **Expected:** Row is created; email is not attempted.
4. Test in-app off/email on with a controlled mail transport.  
   **Expected:** No row; email path is attempted.
5. Test both off.  
   **Expected:** Neither channel delivers.
6. Simulate mail failure and post a valid comment.  
   **Expected:** Comment and audit remain committed; request returns success.

### Scenario 9 — AI-3 fallback and authorization

1. Leave hosted-AI keys blank and restart the server.  
   **Expected:** No secret is sent to the client; deterministic AI-3 advisory data remains available.
2. Open an authorized request as its original approver or active delegate.  
   **Expected:** Advisory card loads; manual comment/approve/reject controls remain usable.
3. Request an unrelated team’s AI summary by ID.  
   **Expected:** `403` without request details.
4. Simulate provider timeout/malformed response in tests.  
   **Expected:** Sanitized error/fallback is used; no provider response, headers, prompt, or key is exposed.

## 7. Audit checks

For each request, verify the timeline contains only expected metadata:

- Submission.
- Supervisor decision.
- Manager decision.
- Coverage-exception acknowledgement where applicable.
- Every comment as one `Comment posted by <role>` entry with comment reference.
- Acting-for context for delegated comments/decisions.
- Reminder event when due.

Expected result: audit actions do not copy full comment bodies, attachments, medical data, tokens, or credentials.

## 8. Troubleshooting

### MySQL connection failure

Check in order:

1. MySQL service is running.
2. `DB_HOST` and `DB_PORT` are reachable.
3. `leave_test` exists before `npm run seed:test`.
4. The limited user has privileges on `leave_test`.
5. `.env.test` is in `server/`, not the project root.
6. `DB_NAME` contains `test`; the safety guard intentionally refuses other names.
7. No shell environment variable is unexpectedly overriding configuration; setup now loads `.env.test` with override enabled.

### npm `404` or missing `jest`/`vite`

- Confirm the configured npm registry is reachable and contains every lockfile package.
- Clear only a corrupted local cache when authorized, then rerun `npm install`.
- Do not hand-edit lockfiles or copy unknown `node_modules` folders into the submission.
- `jest: not found` or `vite: not found` means installation did not finish; it is not a test result.

### `401 Unauthorized`

- Complete both password and 2FA verification steps.
- Confirm the final access token is stored/sent by the client.
- Restart after changing `APP_SECRET`.
- Do not add a 2FA bypass.

### `403 Forbidden`

Confirm:

- User role matches the required tier/action.
- Employee’s original team matches the approver’s team.
- Delegation is same-tier, active, current in Singapore business date, and not revoked.
- Requested schedule team appears in `availableTeams`.
- HR is intentionally read-only for comments.
- Terminal comment threads reject posts.

### 2FA code not received

- Development without SMTP uses the existing non-production demonstration delivery path.
- Production never returns a demo code.
- With SMTP, verify host, port, authorized sender, app password, and recipient.
- Never log or screenshot OTP values.

### Missing comment notifications

- Verify recipient is active.
- Check `notifyInApp` and `notifyEmail` independently.
- Confirm the user is the request owner, an original-team Supervisor/Manager, or an active same-tier delegate.
- Confirm the author is intentionally excluded.
- Check the server’s sanitized delivery log without exposing addresses, comment text, or credentials.

### Team schedule does not show a delegated team

- Confirm the delegation’s start/end dates include today in Asia/Singapore.
- Confirm both users have the same approver role.
- Confirm delegation is active and not revoked.
- Refresh the Approver page; a revoked team may produce one `403` and then fall back to the caller’s own team.

### Flagged item is absent from bulk selection

This is expected. Coverage-flagged requests must be reviewed individually by the Manager. The Manager may approve only after explicit acknowledgement or reject individually with a reason.

## 9. Final evidence checklist

Capture or record:

- Exact unit, M3 integration, full Jest, and client build summaries.
- One normal approval with before/after balance.
- One flagged individual approval and one blocked flagged bulk attempt.
- One active delegation queue and delegated team schedule.
- One revoked delegation returning `403`.
- Comment thread from Employee, Supervisor, Manager, and HR read-only view.
- Comment and audit row pairing.
- Comment recipient notification counts showing no author duplicate.
- Reminder first-run and immediate rerun results.
- AI fallback with hosted keys blank.
- Final secret scan and ZIP contents.

Do not present the system as fully verified until the MySQL suite, full Jest run, client build, and manual scenarios all have current successful evidence.

## 10. Manual email-notification verification

Use only authorized test inboxes. Keep the recipient list small and avoid repeatedly sending to unrelated addresses.

### 10.1 Confirm startup configuration

1. Complete the SMTP placeholders in `server/.env` and set `SMTP_ENABLED=true`.
2. Confirm `CLIENT_URL` is the actual frontend URL, normally `http://localhost:3000` for this project.
3. Start the backend.
4. Confirm the startup output reports that email is enabled and that SMTP verification succeeds.

Expected: startup output never displays the SMTP username, password, transport object, token, or provider response. If configuration is incomplete, the server stays running and prints one sanitized warning naming only the missing variable names.

### 10.2 Optional development redirect for unprovisioned aliases

When a staff alias is not provisioned, route test messages to one controlled inbox without modifying user records:

```dotenv
EMAIL_TEST_MODE=true
EMAIL_TEST_REDIRECT_TO=<controlled-inbox>
```

This mode is disabled by default and ignored in production. It preserves the intended recipient in outgoing test metadata and masks it in the mailer result. Turn it off after testing.

### 10.3 Set notification preferences

For each controlled test user, open **My account → Notification preferences** and choose the intended combination:

| In-app | Email | Expected result |
|---|---|---|
| On | On | One in-app row and one email attempt |
| On | Off | One in-app row; no email |
| Off | On | No in-app row; one email attempt |
| Off | Off | Neither channel |

Repeat at least one event with each combination. A problem in one channel must not block the other.

### 10.4 Verify each M3 event

| Event | Authorized recipient(s) | Safe expected email |
|---|---|---|
| New request | Original team Supervisor(s) and active same-tier delegate(s) | “New leave request awaiting review”; reference, employee name, dates and Supervisor stage only |
| Supervisor approval | Employee status update; original team Manager(s) and active same-tier delegate(s) for action | Manager-review subjects; no balance or leave reason |
| Supervisor rejection | Request owner | Decision subject; safely limited rejection reason when supplied |
| Manager approval | Request owner | Final approval subject with request reference and dates |
| Manager rejection | Request owner | Decision subject with safely limited rejection reason |
| New comment | Owner, original Supervisor, original Manager and active delegates, excluding author | Comment subject contains only the request reference; full comment body is not copied |
| Delegation created | Delegator and delegate | Role/tier, effective dates and acting-for team |
| Delegation revoked | Delegator and delegate | Authority-ended notice |
| Delegation expired | Delegator and delegate, once | Scheduled-expiry notice |
| Pending cancellation | Original current-tier approver(s) and active same-tier delegate(s) | Cancellation notice; no action required |
| 24-hour reminder | Original current-tier approver(s) and active same-tier delegate(s) | Reminder with reference, dates and current stage; no state change |

For every email, verify there is also a plain-text alternative, the sign-in link goes only to `CLIENT_URL`, and the recipient must authenticate before viewing or deciding a request. No email should contain an approval token, OTP, JWT, attachment, medical details, full leave reason, audit payload, AI prompt, or provider error.

### 10.5 Safe provider-failure test

1. Submit and verify one normal request with working SMTP.
2. Temporarily change only a local SMTP setting in `server/.env` to a deliberately invalid test value; do not show or record the real value.
3. Restart the backend and perform a valid comment, delegation, approval or cancellation.
4. Confirm the API still returns business-operation success.
5. Confirm the database change, audit row and enabled in-app notification remain present.
6. Confirm the log contains only a category such as `SMTP_AUTH_FAILED`, `SMTP_TIMEOUT`, or `SMTP_CONNECTION_FAILED`, plus internal user/request identifiers.
7. Restore the correct local setting and restart.

Expected: no browser response or log contains the SMTP password, full recipient address, provider response, transport configuration, leave reason, or comment body.

### 10.6 Reminder deduplication test

1. In the dedicated test database, set a pending request’s `stageEnteredAt` to more than 24 hours ago and clear `lastReminderKey`/`reminderSentAt`.
2. Run `POST /notification/run-reminders` as Manager or HR Admin.
3. Confirm one reminder per original responsible approver and active same-tier delegate.
4. Run the endpoint immediately again and confirm `remindersSent` is `0` for that request and no new email/in-app rows appear.
5. Add a valid same-tier delegate without changing stage, run again, and confirm only the new recipient is claimed.
6. Move the request to its next stage. Confirm the new `stageEnteredAt` resets the 24-hour age.
7. Resolve the request and run again. Confirm no reminder is created or emailed.

### 10.7 SMTP troubleshooting

- `EMAIL_DISABLED`: set `SMTP_ENABLED=true` only in `server/.env` after completing the placeholders.
- `EMAIL_CONFIG_INVALID`: check that host, user, app password and valid from-address are all present.
- `SMTP_AUTH_FAILED`: for Gmail, confirm two-step verification and a current App Password; do not use the normal account password.
- `SMTP_TIMEOUT` or `SMTP_CONNECTION_FAILED`: confirm port `587`, network access and firewall rules; some school or corporate networks block SMTP.
- `SMTP_TLS_FAILED`: use port `587` with `SMTP_SECURE=false` for STARTTLS, or the settings required by the authorized provider.
- `INVALID_RECIPIENT` or `MISSING_RECIPIENT_EMAIL`: correct the active user’s database email; never accept a replacement address from the notification request body.

Automated Jest tests must keep `SMTP_ENABLED=false` through `tests/setupEnv.js`; the mailer unit suite uses a mocked Nodemailer transport and never contacts Gmail.

## 11. Company email domain and SMTP evidence — 6 August 2026

### Demo recipient/login domain

All seeded and documented staff identifiers now use:

```text
@wypledu.online
```

The authenticated SMTP sender remains environment-controlled. Do not replace or hardcode `SMTP_USER`, `SMTP_PASS`, or `SMTP_FROM_EMAIL`; a Gmail SMTP account may continue to send to the `wypledu.online` recipient domain.

### Evidence already observed

| Check | Observed result |
|---|---|
| Final Manager decision in the earlier browser evidence | Business flow completed: request fully approved, employee notification triggered, balance deducted and calendar updated. The old UI displayed two overlapping temporary prompts. |
| Manager review for REQ-75 | Developer screenshot shows delivery to `diana@wypledu.online` over TLS. |
| Final approval for REQ-74 | Email was addressed to stale `kumar@innovare.example.test`, proving the existing development database had not yet been migrated. |
| Gmail delivery status for the stale Kumar address | **Address not found**. This is a recipient/domain bounce, not proof of SMTP authentication failure. |
| Earlier password-reset delivery to controlled `waiyan@wypledu.online` mailbox | Delivered successfully over TLS; proves one working mailbox and prior SMTP connectivity only. |
| Corrected toast path | One production orchestration helper, one `react-hot-toast` call, stable ID `leave-final-approval-<requestId>`, and synchronous single-flight lock. Automated client regression: 5/5 passed. Final visual browser rerun still requires the local app. |

The password-reset success proves SMTP connectivity and delivery to one controlled `wypledu.online` mailbox. It does not prove that every staff alias exists or that every M3 event template has been delivered. Re-run the event matrix below using controlled/authorized inboxes before claiming complete live-email coverage.

### Required live M3 email rerun after database migration

Record one result for each path:

1. New request → responsible Supervisor/delegate.
2. Supervisor approval → responsible Manager/delegate and employee status update.
3. Manager final approval/rejection → employee.
4. New comment → authorized chain participants except the author.
5. Delegation create/revoke/expiry → affected approvers.
6. Pending cancellation → current-stage approver/delegate.
7. 24-hour reminder → current-stage approver/delegate once per stage/recipient claim.
8. Email preference disabled → no email, while enabled in-app delivery remains independent.
9. Simulated provider failure → committed business action remains committed.

Never include a raw password-reset URL/token, SMTP app password, provider message ID, or unredacted inbox screenshot in the submitted ZIP.



## 12. Final workspace verification record

The following commands were actually executed on 6 August 2026 in the final workspace:

| Command | Result |
|---|---|
| `server/npm run check` | **PASS** — 85 files. |
| `server/npm run test:unit -- --runInBand` | **PASS** — 12 suites, 86 tests. |
| `client/npm test` | **PASS** — 5 tests. |
| `client/npm run check` | **PASS** — 18 files. |
| `server/npm run seed:test` | **BLOCKED** — `ECONNREFUSED 127.0.0.1:3306`. |
| `server/npm run test:m3 -- --runInBand` | **BLOCKED in beforeAll** — all 35 scenario bodies were unable to start because MySQL was unavailable. |
| `server/npm test -- --runInBand` | 86 unit tests passed; the 35 MySQL scenarios were setup-blocked. |
| `server/npm run migrate:demo-emails -- --confirm=wypledu.online` | **BLOCKED** — no MySQL listener. |
| `server/npm run verify:demo-emails` | **BLOCKED** — no MySQL listener. |
| `client/npm run build` | **BLOCKED** — missing `@rollup/rollup-linux-x64-gnu`; uploaded dependencies were Windows-targeted and the configured mirror returned 404 for the Linux package. |
| Live Gmail/OpenRouter | **Not executed** — previously posted credentials require rotation; no exposed secret was reused. |

Do not replace these blocked classifications with “passed” until the commands succeed on the target machine.
