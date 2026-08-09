# M3 Handoff — continue from here

You are continuing work on an Annual Leave Management System (SCCCI AI Challenge 2B, Group 4).
Your job is **Member 3 (M3): Approval, Delegation, Notifications, Comments, AI-3**.

The full spec is `CLAUDE_CODE_M3_COMPLETION_PROMPT.md` in this folder — **read it first**, it is the
authority. Supporting docs: `Tier3_M3_Approval_Delegation_Notification.md` (M3 build guide),
`Leave_Management_System_UseCases_and_TaskAllocation_4.md` (UC-02/08/12/15/16/28), `HLD_LeaveManagementSystem_3.md`.

A previous session did **environment setup + full code tracing only**. No M3 defect has been fixed yet.
Everything below is verified fact, not assumption.

---

## 1. Environment — ALREADY DONE, do not redo

| Item | State |
|---|---|
| `server/node_modules`, `client/node_modules` | installed (`npm install`, exit 0) |
| MySQL | 8.0.46 at `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`, service `MySQL80` **running** |
| Databases | `leave` (dev) and `leave_test` (tests) both exist and are **seeded** |
| DB user | `leave`@`localhost` and `leave`@`127.0.0.1`, password `mysql`, granted on both schemas. **Never run as root.** |
| `server/.env` | created (gitignored) → `DB_NAME=leave` |
| `server/.env.test` | created (gitignored) → `DB_NAME=leave_test`, `NODE_ENV=test`, no AI key, no SMTP |
| `client/.env` | created → `VITE_API_BASE_URL=http://localhost:3001` |
| `.gitignore` (root + server) | updated to `.env.*` with `!.env.example` |
| `server/.env.example` | updated with placeholders + docs for `APP_TIMEZONE`, `TWO_FACTOR_MODE`, `LLM_TIMEOUT_MS`, test-DB instructions |
| `server/jest.config.js` | NEW — `setupFiles: tests/setupEnv.js`, `maxWorkers: 1`, 60s timeout |
| `server/tests/setupEnv.js` | NEW — loads `.env.test` **before** `.env` (dotenv never overwrites an already-set var, so test values win) |
| `server/scripts/seedTestDb.js` | NEW — `npm run seed:test`, refuses to run if `DB_NAME` is `leave` |
| `server/services/businessTime.js` | NEW — Singapore-time `todayISO()/toBusinessDateISO()/addDaysISO()/hoursBetween()` via `Intl`. **Written but not yet wired into any caller.** |

### ⚠️ Two traps left behind — fix these first
1. `server/package.json` now has scripts that reference files that **do not exist yet**:
   - `"check": "node scripts/checkSyntax.js"` → create it or delete the script.
   - `"test:unit"` lists `tests/approvalRules.test.js` and `tests/aiClient.test.js` → you are expected to create these; until then that script fails.
2. The OpenRouter key in `server/.env` was pasted in plain chat and is **compromised**. Tell the user to
   rotate it at https://openrouter.ai/keys. Never copy it into source, tests, docs, or logs.

### Verified baseline (before any fix)
```
cd server && npx jest      →  30 passed, 16 failed, 46 total
                              all 16 failures are tests/api.m3.integration.test.js, all HTTP 401
cd client && npm run build →  PASSED (1856 modules, built in 2.46s)
```

---

## 2. Decisions already made — follow them

1. **Repo conventions beat the HLD.** The HLD describes PostgreSQL, `/api` prefixes and a
   `{success, data}` envelope. The actual repo is **MySQL + Sequelize**, routes mounted at `/leave`,
   `/notification`, `/delegation` with **bare-object** success responses and `{message}` / `{errors}`
   errors. Keep the repo's shape. The M3 guide explicitly says the base code is the source of truth.
2. **No migration files exist.** Schema comes from `sequelize.sync({ alter: true })` in
   [server/index.js:55](server/index.js). A new column = an additive field on the model. That *is* the
   migration convention — do not introduce a migration framework.
3. **No new runtime dependencies.** `setInterval` + `nodemailer` only. `jest`/`supertest` are already dev deps.
4. **Same-tier delegation** (SUPERVISOR→SUPERVISOR, MANAGER→MANAGER). Already enforced at
   [server/routes/delegation.js:40](server/routes/delegation.js).
5. **2FA: no bypass needed.** `POST /user/2fa/send` returns a `demoCode` field when **no SMTP/SMS
   transport is configured** — see `sendCodeForChallenge` in
   [server/services/twoFactorService.js:160-173](server/services/twoFactorService.js). `.env.test` has no
   SMTP, so the integration helper can complete the **real** challenge:
   `POST /user/login` → `challengeToken` → `POST /user/2fa/send {challengeToken, method:"EMAIL"}` → `demoCode`
   → `POST /user/2fa/verify {challengeToken, code}` → `accessToken`.
   Also add a guard so `demoCode` is never returned when `NODE_ENV === 'production'`, plus a test proving
   `POST /user/login` never returns an access token under `TWO_FACTOR_MODE=always`.

---

## 3. Verified defect list — implement in this order

Line numbers were read from the current files. Re-confirm before editing.

### T1 — Atomic final approval (critical)
`decideOne` in [server/routes/leaveRequest.js:103-178](server/routes/leaveRequest.js) writes status, balance,
audit and notification as **four separate un-transacted writes** (balance deduction at lines 148-156,
`request.save()` at 165). Two concurrent Manager approvals can both pass the
`status !== "PENDING_MANAGER"` check and **double-deduct**.
**Fix:** wrap the whole decision in `sequelize.transaction`, re-read the request with
`lock: t.LOCK.UPDATE` (or use an atomic conditional `UPDATE … WHERE status='PENDING_MANAGER'` and check
`affectedRows`), revalidate stage + authority + coverage-ack **inside** the transaction, deduct once,
write the audit row inside it, and roll back everything on any failure. Send the notification **after**
commit (email must never roll back an approval). Add a concurrency test that fires two approvals at once
and asserts one 200 + one 4xx and exactly one deduction.

### T2 — AI-3 authorization: cross-team data leak (critical)
[server/routes/ai.js:270](server/routes/ai.js) `GET /ai/summary/:requestId` and
[server/routes/ai.js:156](server/routes/ai.js) `POST /ai/draft-note` check **role only**
(`requireRole("SUPERVISOR","MANAGER")`). Any supervisor can pass any request id and receive another
team's employee name, initials, leave dates, reason, and **teammates' names** (`offNames`).
[server/routes/ai.js:203](server/routes/ai.js) `explain-status` checks same-team but ignores delegation.
**Fix:** in all three, load the request with its `employee`, load effective delegations for the caller, and
require `canActOn(...)` (or ownership/HR for explain-status). Return `403` with no body detail.
Test that a wrong-team approver gets 403 and that an active same-tier delegate gets 200.

### T3 — LLM reliability
[server/services/ai.js:219](server/services/ai.js) and [:244](server/services/ai.js) call `fetch` with
**no timeout**. **Fix:** put the provider call behind a small mockable module (e.g.
`services/llmClient.js`) using `AbortController` bounded by `LLM_TIMEOUT_MS` (already in `.env`/`.env.example`),
validate/sanitise the response shape, never surface raw provider errors or keys to the browser, and fall
back to the existing deterministic output. Add unit tests mocking success / failure / timeout / malformed —
tests must never hit the real API (`.env.test` deliberately has a blank key).
Note: the **AI-3 card itself is already fully deterministic** (computed from the DB, no LLM call), which is
the required non-AI fallback — keep it that way.

### T4 — Delegation must preserve the employee's original chain (critical)
[server/routes/leaveRequest.js:118-120](server/routes/leaveRequest.js) sets `request.routedTeam = actor.team`
when a cross-team delegate approves the Supervisor stage; `effectiveTeam()` in
[server/services/delegationService.js:15](server/services/delegationService.js) then routes the Manager stage
to the **delegate's** team. The spec forbids this: a Team A employee must always reach Team A's Manager.
**Fix:** stop setting `routedTeam` and make `effectiveTeam()` return the employee's team. Keep the column
(additive, `sequelize.sync` won't drop it) or ignore it; update `GET /leave/pending`
([server/routes/leaveRequest.js:574-635](server/routes/leaveRequest.js)) and `isCommentParticipant`
([:51-72](server/routes/leaveRequest.js)) accordingly. A delegate must see **only** requests covered by a
valid delegation.

### T5 — Delegation: Singapore time + validation + audit + lifecycle
- UTC date bug: `todayISO()` at [server/routes/delegation.js:10](server/routes/delegation.js) and
  [server/routes/leaveRequest.js:37](server/routes/leaveRequest.js) use
  `new Date().toISOString().slice(0,10)`. Between 00:00–08:00 SGT this is **yesterday**.
  **Fix:** import `todayISO` from the already-written `server/services/businessTime.js`.
- `isDelegationActive` at [server/services/delegationService.js:9-10](server/services/delegationService.js)
  has a redundant duplicated comparison — tidy it, keep behaviour.
- Add rejection of overlapping/conflicting delegations and of non-`ACTIVE` users
  (`User.status` is `ACTIVE | INVITED | DEACTIVATED`).
- Audit must record **both** the actual actor and the original approver ("acting for"). `AuditLog` only has
  `action` + `actorName` ([server/models/AuditLog.js](server/models/AuditLog.js)) — either encode it in the
  action text or add additive columns.
- Notify on revoke and on expiry, not just on create ([server/routes/delegation.js:53](server/routes/delegation.js)).
- UI already shows the "Acting for X" badge at
  [client/src/pages/Approver.jsx:774-778](client/src/pages/Approver.jsx).

### T6 — Notifications
- `notify()` at [server/services/notificationService.js:8-27](server/services/notificationService.js)
  **ignores** `notifyInApp` / `notifyEmail`, which already exist on the User model
  ([server/models/User.js:57-67](server/models/User.js)) and are editable in the profile UI.
  **Fix:** respect them independently — `notifyInApp` gates the row, `notifyEmail` gates the mail.
- `PUT /leave/:id/cancel` at [server/routes/leaveRequest.js:556-568](server/routes/leaveRequest.js) sends
  **no notification at all**. The responsible approver for the pending stage must be told.
- Email failure must be logged safely for retry/diagnosis, never swallowed silently, and never roll back a
  decision.

### T7 — 24-hour reminders
[server/services/notificationService.js:30-89](server/services/notificationService.js):
- ages from `createdAt`, not from when the request entered its **current** stage — a request that waited
  23h at Supervisor is instantly "overdue" the moment it reaches Manager;
- recipients are `User.findAll({ team of employee, role })`, ignoring active delegates;
- `reminderSentAt` is one per-request marker, not keyed by stage/recipient/window, so advancing a stage
  does not reset it.
**Fix:** add an additive `stageEnteredAt` (set on submit and on every stage change) and a stage-scoped
idempotency key (e.g. additive `lastReminderStage`, or a unique index on request+stage+recipient+window).
Route to the current approver **or** their valid active delegate. Test the exact 24h boundary, re-running
the job (0 new), and that advanced/rejected/cancelled requests get no stale reminder.

### T8 — Employee interface
[client/src/pages/Employee.jsx](client/src/pages/Employee.jsx) has **no notification bell** and **no comment
thread** (verified: it imports only `ConfirmDialog` and `Modal`). The API already allows employees to use
both — `routes/notification.js` is `validateToken` only, and `isCommentParticipant` returns true for
`user.id === request.employeeId`.
**Fix:** the cleanest place for the bell is the shared header in
[client/src/App.jsx:70-94](client/src/App.jsx) so **every** authenticated role gets it — then remove the
duplicate from [Approver.jsx:206](client/src/pages/Approver.jsx) and [Admin.jsx:87](client/src/pages/Admin.jsx)
so there is only one bell. Embed `<CommentThread>` in the employee's own request details
(around [Employee.jsx:887-930](client/src/pages/Employee.jsx)).

### T9 — Bulk decisions
[server/routes/leaveRequest.js:512-554](server/routes/leaveRequest.js) already reuses `decideOne`, authorizes
each id, returns per-id results, and cannot bypass the coverage ack (the client always sends
`acknowledgeException:false`, [Approver.jsx:148](client/src/pages/Approver.jsx)). Remaining gaps:
- bulk rejection accepts **no** `rejectionReason` while single decide requires ≥5 chars
  ([server/routes/leaveRequest.js:661-673](server/routes/leaveRequest.js)) — UC-16 says a rejection comment
  is mandatory. Make it mandatory in bulk too.
- use **one transaction per request** (partial success is the established UI behaviour) and document that.
- keep the route **above** any `/:id/*` route (it currently is, at line 512 — do not move it).

### T10 — Integration tests + fixtures
- `login()` at [server/tests/api.m3.integration.test.js:26-32](server/tests/api.m3.integration.test.js) reads
  `res.body.accessToken`, but with `TWO_FACTOR_MODE=always` login returns `challengeToken` and no token →
  all 16 tests 401. Rewrite the helper to complete the real 2FA flow (see §2.5).
- Tests **A13 / A15 / A16** create a `marcus`(SUPERVISOR) → `diana`(MANAGER) **cross-tier** delegation and
  expect 200; the route correctly rejects that with 400. These tests contradict the guide — rewrite them
  same-tier. The seed already provides the right identities:
  `aiden@wypledu.online` (SUPERVISOR, Compliance Team B) and `grace@wypledu.online` (MANAGER, Compliance Team B),
  alongside Team A's `marcus@` (SUPERVISOR) / `diana@` (MANAGER) / `weiling@` (EMPLOYEE).
- Add the tests listed under "Required automated tests" in the spec, especially: concurrent double-approval,
  wrong-team 403 on AI endpoints, delegate keeps original chain, SGT boundary, 24h boundary + dedup,
  cancellation notifies approver, prefs respected independently, production still enforces 2FA.

---

## 4. Already correct — do not "fix"

- Two-stage routing, no bypass, balance deducted **only** on final Manager approval, terminal states not
  re-decidable — `decideOne` logic is right, it just isn't atomic.
- Coverage-exception acknowledgement: server check at
  [server/routes/leaveRequest.js:137](server/routes/leaveRequest.js), UI checkbox gating the approve button at
  [Approver.jsx:968-992](client/src/pages/Approver.jsx).
- Comment thread server side: participants gate, append-only (no update/delete route), locks on decision.
- Notification ownership: `PUT /notification/:id/read` returns 403 for non-owners
  ([server/routes/notification.js:40-47](server/routes/notification.js)).
- Audit trail is append-only; no route edits or deletes it.
- XSS: React escapes by default and nothing uses `dangerouslySetInnerHTML`.
- Approver UI already has the queue, AI-3 card, bulk bar, delegation panel, audit timeline
  ([Approver.jsx:886-888](client/src/pages/Approver.jsx)), rejection-reason modal, loading/disabled states.
- The 13 pure unit tests in `tests/delegationService.test.js` + `tests/notificationService.test.js` pass and
  match §9.1 of the M3 guide — keep them passing (update only if a spec change makes one wrong, and say why).

---

## 5. Verification commands

```bash
# backend
cd server
npm run seed:test                 # (re)seed leave_test
npx jest                          # full suite  — baseline was 30 pass / 16 fail
npx jest tests/api.m3.integration.test.js
node --check index.js             # and every file you touch

# frontend
cd ../client
npm run build                     # must stay green
```

Report **passed / failed / skipped / not-runnable** separately. Never report a DB test as passing if it
could not connect.

---

## 6. Deliverables

Finish with `M3_COMPLETION_REPORT.md` containing: the requirement→code traceability table, defects found and
fixed, files changed and why, new env vars, exact verification commands, test/build results with counts,
demo accounts (non-secret identifiers only), and any genuine remaining limitation.

Demo accounts (password `demo123!`): `weiling@` EMPLOYEE Team A · `marcus@` SUPERVISOR Team A ·
`diana@` MANAGER Team A · `aiden@` SUPERVISOR Team B · `grace@` MANAGER Team B · `hr@` HR_ADMIN.

**Do not** commit secrets, delete existing tests to make the suite pass, disable 2FA in production, add
runtime dependencies, or restructure folders.
