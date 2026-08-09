# Tier 3 Implementation Guide — Member 3

## Vertical: Approval, Delegation & Notification

> **Owner:** Member 3 (M3) · **Project:** Innovare Leave Management System (SCCCI AI Challenge 2B, Group 4)
> **For:** an implementation agent (Claude Code) working inside the existing `leave-app` monorepo.
> **Use cases covered:** UC-02 (approval), UC-08 (approver visibility), UC-12 (notifications), UC-28 (comment thread), plus the two Enhanced features — bulk approval and approval delegation. AI-3 is **already built**; this phase only *consumes* it.
> **Golden rule for this guide:** the base code is the source of truth. Match its existing patterns exactly. Do **not** introduce a new response envelope, a new ORM style, or a new folder layout.

---

## 1. Overview

The base repo already implements the **core two-tier approval flow**: a request routes Supervisor → Manager with no bypass, balance deducts only on the Manager's final approval, every action writes an `audit_log` row, flagged (low-coverage) requests require an explicit Manager exception, and each pending request shows an AI-3 summary card. A `Notification` model and an in-app `notify()` helper also exist.

This phase completes M3's vertical by adding what is **missing**:

1. **Notifications (UC-12)** — turn the bare `notify()` helper into a proper service that also sends **email** (best-effort, reusing the existing mailer pattern), and expose endpoints so users can **list, count, and mark notifications read**. Add a **24-hour pending-approval reminder** that is *reminder-only* and never auto-approves.
2. **Comment thread (UC-28)** — an **append-only** discussion on a request, **locked once the request is decided**, with a new-comment notification to the other party.
3. **Bulk approve/reject (Enhanced)** — decide many requests in one call, reusing the single-decision logic, with an optional comment.
4. **Delegation (Enhanced)** — an approver going on leave hands their approvals to a deputy for a date window, with **auto-expiry**; the deputy then sees and can decide the delegated queue.

Along the way, tighten approval **authorization** (UC-08): today `PUT /leave/:id/decide` checks role + tier but not team ownership. This phase adds a team/delegation authorization check.

### Scope boundary — do NOT rebuild these (already done)
- `POST /leave/apply`, `GET /leave/pending`, `PUT /leave/:id/decide` (two-tier state machine + balance deduction + coverage-exception `acknowledgeException`).
- `GET /ai/summary/:requestId` (AI-3 summary; keep as-is, keep it advisory-only).
- The `Notification` **model** and the `audit()` helper.

### Ordering (Core before Enhanced)
Implement in this order. **Tasks 1–3 are Core and must land first.** Tasks 4–5 are Enhanced and may be deferred without breaking Core:
`Task 1 (Notification service + email)` → `Task 2 (Notification endpoints + reminder)` → `Task 3 (Comment thread)` → `Task 4 (Bulk decide)` → `Task 5 (Delegation)` → `Task 6 (frontend wiring)`.

---

## 2. Tech Stack (do not deviate)

Read from the existing `package.json` files — **use only what is already declared**, except the two dev-only test packages approved in §9.

**Backend** (`server/`)
- Node.js + **Express `^4.19.2`**
- **Sequelize `^6.37.2`** over **MySQL** (`mysql2 ^3.9.3`) — dialect `mysql`, timezone `+08:00` (SGT), `logging: false`
- **yup `^1.4.0`** for request validation
- **jsonwebtoken `^9`**, **bcrypt `^6`**, **nodemailer `^6.9.13`**, `cors`, `dotenv`
- Schema is applied by `sequelize.sync({ alter: true })` in `server/index.js` — **there are no migration files**. A new table = a new model file in `server/models/`. A new column = an added field on an existing model (additive only).

**Frontend** (`client/`)
- **Vite + React + Tailwind**, **axios** via `client/src/lib/http.js` (JWT is attached automatically; a `401` auto-logs-out — do not re-implement auth handling).

**Runtime dependencies rule:** add **no new runtime dependencies**. The reminder scheduler uses the built-in `setInterval` (no `node-cron`). Email uses the already-installed `nodemailer`.

---

## 3. Code Standards (mirror the existing files)

These are extracted from the current codebase. Follow them exactly.

**Route file shape**
```js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { /* models */ } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
// ... routes ...
module.exports = router;
```

**Auth & RBAC** — every protected route uses `validateToken` then `requireRole(...)`. `req.user` carries `{ id, name, role, team, country }`. Roles are `EMPLOYEE | SUPERVISOR | MANAGER | HR_ADMIN`. **RBAC is enforced server-side on every call; never trust the UI.**

**Validation & responses** — validate the body with a `yup` object, then:
- Validation failure → `res.status(400).json({ errors: err.errors })`
- Business-rule failure → `res.status(4xx).json({ message: "..." })`
- Not found / forbidden / unauthorized → `res.sendStatus(404 | 403 | 401)`
- Success → return the bare object/array (e.g. `res.json(list)` or `res.json({ request })`). **Do not wrap successes in a new envelope.**

**Auditing** — every state-changing action calls the existing helper `audit(requestId, actorName, action)` which creates an `AuditLog` row. Reuse it; keep messages short and human-readable, matching the existing style (e.g. `"Approved by Manager - final"`).

**Notifications** — after this phase, all in-app/email notifications go through `notify(...)` in `services/notificationService.js` (see Task 1). Do not create `Notification` rows directly in routes anymore.

**Model shape**
```js
module.exports = (sequelize, DataTypes) => {
  const Thing = sequelize.define("Thing", { /* fields */ }, { tableName: 'things' });
  Thing.associate = (models) => { /* belongsTo / hasMany */ };
  return Thing;
};
```
Model class names are **PascalCase singular** (`Comment`), table names **snake_case plural** (`request_comments`). Define new relationships from the **new** model via `belongsTo` (Sequelize creates the FK); do **not** edit `models/User.js` — it is a shared/M1 file.

**AI outputs are advisory only.** Balance math, routing, coverage thresholds and lock rules are decided in code, never by a model.

---

## 4. Project Structure — files to add / modify

```
server/
├── models/
│   ├── Comment.js                 # NEW  (UC-28)
│   ├── Delegation.js              # NEW  (Enhanced)
│   ├── Notification.js            # MODIFY (add type + requestId columns)
│   └── LeaveRequest.js            # MODIFY (add reminderSentAt column)
├── services/
│   ├── notificationService.js     # NEW  (notify + email + reminder logic)
│   └── delegationService.js       # NEW  (pure helpers: isDelegationActive, canActOn, matchesTier)
├── routes/
│   ├── notification.js            # NEW  (mounted at /notification)
│   ├── delegation.js              # NEW  (mounted at /delegation)
│   └── leaveRequest.js            # MODIFY (comments, bulk-decide, decide authz, use notify service)
├── services/mailer.js             # MODIFY (add sendNotificationEmail, mirroring sendResetEmail)
├── index.js                       # MODIFY (mount 2 routes + start reminder scheduler — 5 lines)
└── tests/                         # NEW  (unit tests — see §9)
    ├── delegationService.test.js
    └── notificationService.test.js

client/src/
├── components/
│   ├── NotificationBell.jsx       # NEW  (shared; wired into Approver page)
│   ├── CommentThread.jsx          # NEW  (shared; embedded in RequestCard)
│   └── DelegationPanel.jsx        # NEW  (delegate setup + revoke list)
└── pages/Approver.jsx             # MODIFY (bell, comment thread, bulk bar, delegation toggle)
```

> `Approver.jsx` is M3's page (it already hosts UC-02 + AI-3). `index.js`, `Notification.js`, and `LeaveRequest.js` are shared — edits to them must be **additive** and clearly commented `// M3:`.

---

## 5. Data Model Changes

All additive. `sync({ alter: true })` will create the tables/columns on next boot.

### 5.1 NEW — `server/models/Comment.js`  (UC-28)
```js
module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define("Comment", {
    body: { type: DataTypes.STRING(500), allowNull: false },
    authorName: { type: DataTypes.STRING(50), allowNull: false },
    authorRole: { type: DataTypes.ENUM("EMPLOYEE","SUPERVISOR","MANAGER","HR_ADMIN"), allowNull: false }
  }, { tableName: 'request_comments' });

  Comment.associate = (models) => {
    Comment.belongsTo(models.LeaveRequest, { foreignKey: "requestId", onDelete: "cascade" });
    Comment.belongsTo(models.User, { as: "author", foreignKey: "authorId" });
  };
  return Comment;
};
```
Comments are **append-only** — no update/delete endpoints, ever. `authorName`/`authorRole` are denormalised for display (same approach the codebase uses for `AuditLog.actorName`).

### 5.2 NEW — `server/models/Delegation.js`  (Enhanced)
```js
module.exports = (sequelize, DataTypes) => {
  const Delegation = sequelize.define("Delegation", {
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate:   { type: DataTypes.DATEONLY, allowNull: false },
    reason:    { type: DataTypes.STRING(200), allowNull: true },
    active:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'delegations' });

  Delegation.associate = (models) => {
    Delegation.belongsTo(models.User, { as: "fromUser", foreignKey: "fromUserId" });
    Delegation.belongsTo(models.User, { as: "toUser",   foreignKey: "toUserId" });
  };
  return Delegation;
};
```
A delegation is **effective** only when `active === true` **and** `startDate <= today <= endDate` (auto-expiry is computed on read; `active` also lets an owner revoke early).

### 5.3 MODIFY — `server/models/Notification.js` (add context columns)
Add two additive fields inside the existing `sequelize.define(...)` object (keep `message` and `readAt` as they are):
```js
    type:      { type: DataTypes.STRING(20), allowNull: true },   // M3: e.g. "APPROVAL", "COMMENT", "REMINDER", "DELEGATION"
    requestId: { type: DataTypes.INTEGER,   allowNull: true },    // M3: link back to the leave_requests row, when relevant
```

### 5.4 MODIFY — `server/models/LeaveRequest.js` (reminder dedup marker)
Add one additive field inside the existing `sequelize.define(...)` object:
```js
    reminderSentAt: { type: DataTypes.DATE, allowNull: true },    // M3: last 24h pending-reminder timestamp
```

---

## 6. API Endpoints (contracts)

All paths are absolute (routes carry **no** `/api` prefix — they are mounted at `/leave`, `/notification`, `/delegation`). All examples assume a valid `Authorization: Bearer <jwt>` header.

### 6.1 Notifications — `routes/notification.js` (mounted `/notification`)

**`GET /notification`** — role: any authenticated. Optional `?unread=true`. Returns the caller's notifications, newest first.
```json
[
  { "id": 12, "message": "Your request 5 is now APPROVED.", "type": "APPROVAL", "requestId": 5, "readAt": null, "createdAt": "2026-07-14T02:10:00.000Z" }
]
```

**`GET /notification/unread-count`** — role: any authenticated.
```json
{ "count": 3 }
```

**`PUT /notification/:id/read`** — role: any authenticated; only the owner may mark their own.
- Success `200`: `{ "message": "Marked read." }`
- Not owner: `403` (sendStatus) · Missing: `404` (sendStatus)

**`PUT /notification/read-all`** — role: any authenticated.
```json
{ "message": "All notifications marked read.", "updated": 3 }
```

**`POST /notification/run-reminders`** — role: `MANAGER`, `HR_ADMIN` (manual trigger for the demo; the scheduler also calls this logic hourly).
```json
{ "remindersSent": 2 }
```

### 6.2 Comments — added to `routes/leaveRequest.js` (mounted `/leave`)

**`GET /leave/:id/comments`** — role: any authenticated, but **participants only** (the request's employee, or an approver entitled to act on it per §7). Returns the thread oldest-first.
```json
[
  { "id": 1, "authorName": "Marcus Lim", "authorRole": "SUPERVISOR", "body": "Can you cover the Tuesday standup?", "createdAt": "2026-07-14T01:00:00.000Z" }
]
```
Not a participant → `403`. Missing request → `404`.

**`POST /leave/:id/comments`** — role: any authenticated participant. Body:
```json
{ "body": "Handover doc is in the shared drive." }
```
- Validation (`body`: trimmed, 1–500 chars) failure → `400 { "errors": [...] }`
- **Locked** (request status is `APPROVED | REJECTED | CANCELLED`) → `400 { "message": "Comments are locked once the request is decided." }`
- Success `200`: the created comment object. Side effect: `notify()` the **other party** (if the author is the employee → notify the current-tier approver(s); if the author is an approver → notify the employee), `type: "COMMENT"`, `requestId: id`.

### 6.3 Bulk decide — added to `routes/leaveRequest.js`

**`PUT /leave/bulk-decide`** — role: `SUPERVISOR`, `MANAGER`. Body:
```json
{ "ids": [5, 6, 7], "approve": true, "comment": "Approved — team is covered.", "acknowledgeException": false }
```
Runs the **same** decision path as `PUT /leave/:id/decide` for each id (tier check, authorization per §7, balance deduction on final Manager approval, audit row, employee notification, and the flagged/`acknowledgeException` rule). Optional `comment` is posted to each decided request. Returns a per-id result array (partial success is normal):
```json
{
  "results": [
    { "id": 5, "ok": true,  "status": "PENDING_MANAGER" },
    { "id": 6, "ok": false, "message": "Request is not at the Supervisor tier." },
    { "id": 7, "ok": false, "message": "Flagged: set acknowledgeException=true to approve the exception." }
  ]
}
```

### 6.4 Delegation — `routes/delegation.js` (mounted `/delegation`)

**`POST /delegation`** — role: `SUPERVISOR`, `MANAGER`. Body:
```json
{ "toUserId": 3, "startDate": "2026-07-20", "endDate": "2026-07-24", "reason": "Annual leave" }
```
Validation: dates match `^\d{4}-\d{2}-\d{2}$`; `endDate >= startDate`; `startDate >= today`; `toUserId` must exist and be `SUPERVISOR` or `MANAGER` and not the caller. Errors → `400 { "message": ... }`. Success `200`: created delegation. Side effect: `notify()` the delegate (`type: "DELEGATION"`).

**`GET /delegation/mine`** — role: `SUPERVISOR`, `MANAGER`. Returns `{ "given": [...], "received": [...] }` (delegations I created, and delegations to me), each including `fromUser`/`toUser` `{ id, name }` and an `effective` boolean computed via `isDelegationActive`.

**`GET /delegation/candidates`** — role: `SUPERVISOR`, `MANAGER`. Approvers the caller can delegate to: `SUPERVISOR`/`MANAGER` users excluding self. Returns `[{ id, name, role, team }]`.

**`PUT /delegation/:id/revoke`** — role: owner (`fromUserId === req.user.id`) only. Sets `active = false`. `{ "message": "Delegation revoked." }`. Not owner → `403`. Missing → `404`.

### 6.5 Modified — `GET /leave/pending` and `PUT /leave/:id/decide`
- **`GET /leave/pending`** now returns the caller's own tier/team queue **plus** any queue delegated to them by an effective delegation. Tag delegated rows with `"actingFor": { "id": <fromUserId>, "name": "<fromUser name>" }` so the UI can label them; own rows omit the field.
- **`PUT /leave/:id/decide`** now calls `canActOn(...)` (§7) and returns `403 { "message": "You are not authorised to act on this request." }` when the approver is neither the employee's own-team approver at the matching tier nor an effective delegate for it.

---

## 7. Authorization rules (UC-08) — put these in `services/delegationService.js`

Pure, DB-free, and therefore unit-testable:

```js
// Which pending status does an approver's role act on?
const matchesTier = (role, status) =>
  (role === "SUPERVISOR" && status === "PENDING_SUPERVISOR") ||
  (role === "MANAGER"    && status === "PENDING_MANAGER");

// today, startDate, endDate are 'YYYY-MM-DD' strings → lexicographic compare is safe.
const isDelegationActive = (d, todayISO) =>
  d.active === true && d.startDate <= todayISO && todayISO >= d.startDate && todayISO <= d.endDate;

// approver: {id, role, team}; request: {status, employee:{team}};
// delegations: effective delegations TO this approver, each with fromUser {team, role}
const canActOn = (approver, request, delegations = []) => {
  if (!matchesTier(approver.role, request.status)) return false;
  // Own-team path
  if (approver.team === request.employee.team) return true;
  // Delegated path: an effective delegation from an approver whose team+tier match this request
  return delegations.some(d =>
    d.fromUser.team === request.employee.team && matchesTier(d.fromUser.role, request.status));
};

module.exports = { matchesTier, isDelegationActive, canActOn };
```

In routes, load `todayISO = new Date().toISOString().slice(0,10)` and the caller's effective delegations once, then use these helpers.

---

## 8. Step-by-Step Tasks (ordered, with error cases)

### Task 1 — Notification service + email (Core, UC-12)
1. Create `services/notificationService.js` exporting `notify(userId, message, opts = {})` where `opts = { type, requestId }`:
   - Create the `Notification` row `{ userId, message, type: opts.type ?? null, requestId: opts.requestId ?? null }`.
   - **Best-effort email:** load the user's `email`; call `mailer.sendNotificationEmail(email, subject, message)` inside a `try/catch` that **swallows errors** (a mail failure must never block the in-app notification or the caller's response). Subject = `"Leave Management System: update"`.
2. Add `sendNotificationEmail(toEmail, subject, text)` to `services/mailer.js`, mirroring `sendResetEmail`: if `smtpConfigured()` send via the same nodemailer transport; otherwise `console.log` the message and return `{ sent: false }` (keeps the demo fully offline).
3. Refactor `routes/leaveRequest.js`: delete the local `const notify = ...` and instead `const { notify } = require('../services/notificationService')`. Update its existing call sites to pass context, e.g. on final decision: `notify(request.employeeId, \`Your request ${request.id} is now ${request.status.replace("_"," ")}.\`, { type: "APPROVAL", requestId: request.id })`.
   - **Error case:** keep the existing behaviour identical otherwise — do not change routing or balance logic.

### Task 2 — Notification endpoints + 24-hour reminder (Core, UC-12)
1. Create `routes/notification.js` with the four read/list endpoints in §6.1. Ownership: a user may only read/mark **their own** notifications (`where userId = req.user.id`); marking someone else's → `403`.
2. In `services/notificationService.js` add:
   - `isReminderDue(request, now)` — pure: returns true iff `status ∈ {PENDING_SUPERVISOR, PENDING_MANAGER}` **and** `now - createdAt >= 24h` **and** (`reminderSentAt` is null **or** `now - reminderSentAt >= 24h`).
   - `runPendingReminders()` — find pending requests, filter with `isReminderDue`, and for each: `notify()` the **current-tier approver(s)** of that request's team (`type: "REMINDER"`, `requestId`), write `audit(request.id, "System", "24-hour reminder sent")`, and set `request.reminderSentAt = new Date()`. **It must never change `status`.** Return the count.
   - `startReminderScheduler()` — `setInterval(runPendingReminders, 60*60*1000)` and run once ~10s after boot. Guard against double-registration.
3. Add `POST /notification/run-reminders` (role `MANAGER`, `HR_ADMIN`) that calls `runPendingReminders()` and returns `{ remindersSent }`.
4. In `server/index.js` add (clearly marked `// M3:`): mount `/notification`, and `require('./services/notificationService').startReminderScheduler()` after `sync()` resolves.
   - **Error case:** if the mailer throws inside a reminder, the sweep must continue to the next request (wrap per-request work in try/catch).

### Task 3 — Comment thread (Core, UC-28)
1. Create `models/Comment.js` (§5.1). Register nothing manually — `models/index.js` auto-loads it.
2. Add `GET /leave/:id/comments` and `POST /leave/:id/comments` to `routes/leaveRequest.js` per §6.2.
   - **Participants gate:** load the request with its `employee`; allow if `req.user.id === request.employeeId`, else require `canActOn(req.user, request, effectiveDelegations)` OR (same team + matching tier). Otherwise `403`.
   - **Lock gate:** if `status` is not a `PENDING_*` value → `400` with the lock message.
   - On successful POST: create the comment (denormalise `authorName`/`authorRole` from `req.user`), then `notify()` the other party with `type: "COMMENT"`, `requestId`.

### Task 4 — Bulk decide (Enhanced)
1. Extract the single-request decision body from `PUT /leave/:id/decide` into an internal async helper `decideOne(actor, request, approve, acknowledgeException)` returning `{ ok, status?, message? }` (no `res` inside it). Refactor the existing `/:id/decide` route to call it so behaviour is unchanged.
2. Add `PUT /leave/bulk-decide` (§6.3): validate `{ ids:[int], approve:bool, comment?:string, acknowledgeException?:bool }`; load each request; run `canActOn` then `decideOne`; if a `comment` is present and the decision succeeded, post it via the Task 3 logic; collect `{ id, ok, ... }`. Never let one failing id abort the others.
   - **Error cases surfaced per-id:** wrong tier, unauthorised (`canActOn` false), flagged-without-ack, missing id.

### Task 5 — Delegation (Enhanced)
1. Create `models/Delegation.js` (§5.2) and `routes/delegation.js` (§6.4). Mount `/delegation` in `index.js`.
2. Modify `GET /leave/pending`: after building the caller's own-team/own-tier list, also compute effective delegations **to** the caller (`toUserId = req.user.id`, `isDelegationActive` true); for each, add that delegator's team + matching tier to the query and tag results with `actingFor`. De-duplicate by request id.
3. Modify `PUT /leave/:id/decide` (and therefore `decideOne` callers): enforce `canActOn` before deciding.

### Task 6 — Frontend wiring (`client/`)
1. **`components/NotificationBell.jsx`** — on mount and every 30s, `GET /notification/unread-count` (badge) and `GET /notification` (dropdown list). Clicking an item `PUT /notification/:id/read`; a "Mark all read" button hits `/notification/read-all`. Use existing Tailwind teal/slate classes from `Approver.jsx` for a consistent look. Render it in the `Approver.jsx` header row.
2. **`components/CommentThread.jsx`** — props `{ requestId, locked, setToast }`. `GET /leave/:id/comments` on mount; render oldest→newest; a textarea + **Post** button hitting `POST /leave/:id/comments`. When `locked`, hide the input and show *"Comments are locked — this request has been decided."* Embed `<CommentThread requestId={req.id} locked={!req.status.startsWith("PENDING")} setToast={setToast} />` inside `RequestCard` in `Approver.jsx`.
3. **Bulk bar** in `Approver.jsx` queue — add a checkbox per `RequestCard`; a sticky action bar appears when ≥1 selected with **Approve selected** / **Reject selected**, calling `PUT /leave/bulk-decide` with the collected ids; on partial failure, `setToast` a summary from `results`.
4. **`components/DelegationPanel.jsx`** — a toggle button "Delegate approvals" (next to "+ Add employee"). Form: delegate (select populated from `GET /delegation/candidates`), start/end dates, reason → `POST /delegation`. Below the form, list `GET /delegation/mine → given` with a **Revoke** button (`PUT /delegation/:id/revoke`). Show delegated queue items in the main list using their `actingFor` tag (e.g. a small "Acting for Marcus Lim" badge on the card).

---

## 9. Test Specifications

Add **jest** and **supertest** as `devDependencies` (these two are explicitly approved for this phase; add nothing else) and an npm script `"test": "jest"`. Put tests in `server/tests/`.

### 9.1 Pure-function unit tests (no DB, jest) — implement all
`server/tests/delegationService.test.js`
- **T1 matchesTier** — `matchesTier("SUPERVISOR","PENDING_SUPERVISOR") === true`.
- **T2 matchesTier** — `matchesTier("SUPERVISOR","PENDING_MANAGER") === false`.
- **T3 matchesTier** — `matchesTier("MANAGER","PENDING_MANAGER") === true`.
- **T4 isDelegationActive** — active row, `today` inside window → `true`.
- **T5 isDelegationActive** — active row, `today` after `endDate` → `false` (auto-expiry).
- **T6 isDelegationActive** — `active:false`, `today` inside window → `false` (revoked).
- **T7 canActOn** — same team, matching tier, no delegations → `true`.
- **T8 canActOn** — different team, no delegations → `false`.
- **T9 canActOn** — different team but an effective delegation from a matching-team+tier approver → `true`.

`server/tests/notificationService.test.js`
- **T10 isReminderDue** — pending, `createdAt` 30h ago, `reminderSentAt:null` → `true`.
- **T11 isReminderDue** — pending, `createdAt` 2h ago → `false` (under 24h).
- **T12 isReminderDue** — `status:"APPROVED"`, `createdAt` 30h ago → `false` (not pending).
- **T13 isReminderDue** — pending, `createdAt` 30h ago, `reminderSentAt` 1h ago → `false` (already reminded within window).

### 9.2 API test matrix (run against the dev server on the seed data; or as supertest integration tests)
Seed users (password `demo123!`, team *Compliance Team A*): `weiling@` (EMPLOYEE), `marcus@` (SUPERVISOR), `diana@` (MANAGER). Seed leaves a **PENDING_SUPERVISOR** annual request and a **PENDING_MANAGER** sick_mc request.

| # | As | Call | Expect |
|---|----|------|--------|
| A1 | marcus | `GET /notification/unread-count` | `200`, `{ count: N }` |
| A2 | weiling | `PUT /notification/:id/read` on a notification **owned by marcus** | `403` |
| A3 | marcus | `POST /notification/run-reminders` | `403` (wrong role) |
| A4 | diana  | `POST /notification/run-reminders` | `200`, `{ remindersSent: >=0 }`; reruns immediately → sends **0** more (dedup) |
| A5 | marcus | `GET /leave/:id/comments` on the PENDING_SUPERVISOR request | `200`, array |
| A6 | weiling| `POST /leave/:id/comments` `{body:"hi"}` on her own pending request | `200`; marcus receives a `COMMENT` notification |
| A7 | any    | `POST /leave/:id/comments` `{body:""}` | `400`, `{ errors: [...] }` |
| A8 | diana  | approve the PENDING_MANAGER request, then `POST /leave/:id/comments` | `400`, `{ message: "Comments are locked once the request is decided." }` |
| A9 | marcus | `GET /leave/:id/comments` for a request in **another team** | `403` |
| A10| marcus | `PUT /leave/bulk-decide` `{ids:[<pending_sup_id>], approve:true}` | `200`, `results[0].ok===true`, status `PENDING_MANAGER` |
| A11| marcus | same bulk call including a **PENDING_MANAGER** id | that id → `ok:false`, `"not at the Supervisor tier"` |
| A12| diana  | bulk-approve a **flagged** request without `acknowledgeException` | that id → `ok:false`, mentions `acknowledgeException` |
| A13| marcus | `POST /delegation` `{toUserId:<diana>, startDate:<today>, endDate:<today+3>}` | `200`; diana gets a `DELEGATION` notification |
| A14| marcus | `POST /delegation` `{toUserId:<weiling>...}` (an EMPLOYEE) | `400` (delegate must be an approver) |
| A15| marcus | `POST /delegation` with `endDate < startDate` | `400` |
| A16| weiling| `PUT /delegation/:id/revoke` on marcus's delegation | `403` (not owner) |
| A17| — | with an active delegation marcus→diana, `GET /leave/pending` as diana | includes marcus's team queue, tagged `actingFor: { name:"Marcus Lim" }` |

---

## 10. Definition of Done (M3 phase)
- [ ] `GET/PUT /notification*` work; a user can list, count, and mark **their own** notifications read; marking another user's returns `403`.
- [ ] Every approval/comment/delegation event produces an **in-app** notification and a **best-effort email** (logged to console when SMTP is unset); a mail failure never breaks the request.
- [ ] The 24-hour reminder fires for still-pending requests, writes an audit row, sets `reminderSentAt`, and **never changes status or auto-approves**; rerunning immediately sends none.
- [ ] Comment thread is append-only, participants-only, and **locks** the moment a request is `APPROVED`/`REJECTED`/`CANCELLED`; a new comment notifies the other party.
- [ ] Bulk decide reuses the single-decision logic (tier, authorization, balance-on-final, audit, flagged/ack) and returns per-id results with partial success.
- [ ] Delegation creates/lists/revokes correctly, **auto-expires** on `endDate`, and the delegate sees + can decide the delegated queue; requests are tagged `actingFor`.
- [ ] `PUT /leave/:id/decide` rejects approvers who are neither the employee's own-team approver at the matching tier nor an effective delegate (`403`).
- [ ] All §9.1 unit tests pass (`npm test` in `server/`); the §9.2 matrix passes against the seed data.
- [ ] RBAC enforced server-side on every new route; responses use the existing `{ message }` / `{ errors }` / bare-object conventions — **no new envelope**.
- [ ] No new runtime dependencies added; `server/index.js` still boots and `sync({ alter: true })` creates the new tables/columns cleanly.
- [ ] Approver page shows the notification bell, per-request comment thread, bulk action bar, and delegation panel; every new screen works on a mobile-width browser.

---

## 11. Guardrails for the agent (read before coding)
- **Do NOT** modify the two-tier routing, balance deduction, coverage-exception, or AI-3 logic beyond the explicit refactors named in Tasks 1, 4, and 5.
- **Do NOT** add runtime dependencies (no `node-cron`, no notification libraries). `setInterval` + `nodemailer` only. `jest`/`supertest` are dev-only.
- **Do NOT** invent a response envelope, change the ORM/dialect, or restructure folders. Match existing files.
- **Do NOT** edit `models/User.js`; define new relations from the new models.
- **Do NOT** let AI or email influence a decision — keep model output advisory and email best-effort.
- **Verify against §9 before finishing.** If a test can't pass, fix the code — not the test.

---

## 12. Suggested prompt to Claude Code
> I'm working in the existing `leave-app` monorepo (Node/Express + Sequelize/**MySQL** backend, Vite/React/Tailwind frontend). Implement **Member 3's phase** exactly as specified in this guide: `Tier3_M3_Approval_Delegation_Notification.md`.
> Implement Tasks 1–3 (Core) first, then 4–5 (Enhanced), then 6 (frontend). Follow the existing code conventions in `server/routes/leaveRequest.js`, `server/models/*`, and `client/src/pages/Approver.jsx` precisely — same validation style, same `{ message }`/`{ errors }` error responses, same model shape, same Tailwind classes.
> Add **no** new runtime dependencies (`jest`/`supertest` dev-only are fine). Do not touch the two-tier routing, balance, coverage-exception, or AI-3 logic except for the refactors this guide names. Add all `server/tests/` unit tests from §9.1 and make `npm test` pass. When done, list every file you created or modified and confirm the §10 Definition of Done item by item.

*End of Tier 3 guide — M3.*
