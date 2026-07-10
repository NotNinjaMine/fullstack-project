# HR Leave Management – Backend

**Member 3: Workflow & Notifications**  
Stack: Node.js · Express · PostgreSQL (or embedded PGlite) · JWT · Nodemailer

## Quick start (SQLite — default)

No Postgres install required. Uses Node’s built-in `node:sqlite`.

```bash
cd backend
npm install
npm run seed    # resets the disposable demo database + creates demo users
npm run db:migrate  # safe, idempotent upgrade path for an existing database
npm run dev     # http://localhost:3001
npm run smoke   # end-to-end check (server must be running)
```

`.env`:
```
DB_DRIVER=sqlite
```

`npm run seed` and `npm run db:init` use a reset schema. Do not run them against a database you need to preserve; use `npm run db:migrate` for upgrades.

## Other drivers

| `DB_DRIVER` | Use when |
|-------------|----------|
| `sqlite` | Quick local testing (default) |
| `pglite` | Embedded Postgres file DB |
| `pg` | Real PostgreSQL |

Real PostgreSQL example:

```
DB_DRIVER=pg
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_leave
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=change-me
```

## Grade verification

With the server running:

```bash
npm run grade   # 28 automated checks (RBAC, state machine, balance, cancel, notifications)
npm run smoke   # shorter happy-path smoke test
```

## Demo users

Password for all: **`Password123!`**

| Email | Role |
|-------|------|
| alice.tan@company.com | employee |
| bob.supervisor@company.com | supervisor |
| carol.manager@company.com | manager |
| hr.admin@company.com | hr_admin |
| bob.lim@company.com | employee (seeded approved leave) |

## Member 3 owned use cases

| UC | Feature | Status |
|----|---------|--------|
| UC-02 | Two-tier approval (+ AI-3 card) | Done |
| UC-12 | Notifications in-app + email + WhatsApp + optional Telegram | Done |
| UC-08 | Approver calendar + history | Done |
| UC-15 | Approval delegation | Done |
| UC-16 | Bulk approve/reject | Done |
| AI-3 | Approval assistant summary | Done (rule engine) |

## API surface

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | JWT |
| GET/POST | `/api/leave` | Own list / create |
| GET | `/api/leave/balance` | Balance + optional AI summary |
| PUT | `/api/users/profile` | Own phone/address only |
| GET | `/api/leave/:id` | Owner / approver / HR |
| POST | `/api/leave/:id/cancel` | Owner or HR |
| GET | `/api/leave/overlap` | Team overlap |
| GET | `/api/approvals` | UC-02 queue (+ AI-3) |
| GET | `/api/approvals/calendar` | UC-08 |
| GET | `/api/approvals/history` | UC-08 |
| POST | `/api/approvals/bulk` | UC-16 |
| GET/POST | `/api/approvals/delegations` | UC-15 |
| DELETE | `/api/approvals/delegations/:id` | UC-15 revoke |
| PUT | `/api/approvals/:id/approve` | Two-tier / acting |
| PUT | `/api/approvals/:id/reject` | Note required |
| GET | `/api/notifications` | UC-12 |
| POST | `/api/admin/holidays/load` | HR Admin holiday cache loader |
| PUT | `/api/notifications/:id/read` | Owner |
| PUT | `/api/notifications/read-all` | JWT |
| GET | `/health` | Liveness |

## Telegram notifications (optional)

Telegram is a fan-out channel alongside email/WhatsApp. In-app notifications always run.

1. Run migrations (adds nullable `users.telegram_chat_id`):

```bash
npm run db:migrate
```

2. Create a bot with Telegram **@BotFather**, set in `.env`:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
```

3. User opens the bot and sends `/start`, then find `chat.id` via:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

4. Save the chat id:

```sql
UPDATE users SET telegram_chat_id = '123456789' WHERE email = 'alice.tan@company.com';
```

If the token or chat id is missing, Telegram is skipped safely. Full steps: `docs/NOTIFICATIONS-SETUP.md`.

## Layout

```
backend/
  server.js
  src/
    app.js
    config/          db.js, dbPg.js, dbPglite.js
    middleware/      auth, rbac, errorHandler
    controllers/     thin HTTP adapters
    services/        leave, approval, policy, overlap, audit, notifications, telegram, reminder
    routes/
    db/              schema.sql, seed.js, migrate.js, migrations/
    utils/
  scripts/smoke-test.js
```

## Business rules (enforced)

- Supervisor **and** manager must approve; no auto-approve; supervisor cannot be bypassed
- Balance deducted **only** on final manager approval
- Balance restored **only** when cancelling a previously approved leave (final cancel approve)
- Half-day = single calendar day; weekends + public holidays excluded from `days_count`
- Every create / approve / reject / cancel writes `audit_log` with JSONB before/after
- 24h reminder job notifies current approver only — **never** auto-approves
- Email bodies contain no PII (login to see details)

## Out of scope hooks

- **AI-1** natural-language leave parsing — accept structured body; TODO in `leaveController`
- **AI-3** approver summary card — TODO in `approvalService.listPendingForApprover`
