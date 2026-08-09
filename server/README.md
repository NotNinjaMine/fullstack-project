# Leave Management System - Server

Express + Sequelize (MySQL) API following the lab5 project conventions.

## Setup
1. Open the extracted ZIP project in your editor or workspace.
2. Copy `.env.example` to `.env` and fill in your MySQL credentials + APP_SECRET.
  Create the database first: `CREATE DATABASE leave;`
  Optional: SMTP_* for real emails; OPENAI_API_KEY + OPENAI_BASE_URL (OpenRouter)
  for AI-1 parse / improve-remarks (or ANTHROPIC_API_KEY). Leave blank for offline heuristic.
3. For an existing development database, run:
   `npm run migrate:demo-emails -- --confirm=wypledu.online`, then
   `npm run verify:demo-emails`.
4. Run `npm run seed`; seeding also repairs legacy demo-domain rows before account creation.
5. Run `npm run check`, `npm run test:unit -- --runInBand`, and the MySQL-backed commands against a dedicated test schema.
6. Start the server. Startup intentionally refuses active legacy-domain recipients.

Do not use credentials previously exposed in chat. Rotate them and keep all real values only in local gitignored environment files.

## Demo account identifiers
| Email | Role | Country |
|---|---|---|
| weiling@wypledu.online | EMPLOYEE | SG |
| priya@wypledu.online | EMPLOYEE | SG |
| kumar@wypledu.online | EMPLOYEE | SG |
| faridah@wypledu.online | EMPLOYEE | SG |
| linh@wypledu.online | EMPLOYEE | VN |
| somchai@wypledu.online | EMPLOYEE | TH |
| marcus@wypledu.online | SUPERVISOR | SG |
| diana@wypledu.online | MANAGER | SG |
| aiden@wypledu.online | SUPERVISOR | SG |
| grace@wypledu.online | MANAGER | SG |
| hr@wypledu.online | HR_ADMIN | SG |

## Routes
- POST /user/register, POST /user/login, GET /user/auth
- POST /user/forgot-password (public) - single-use 30-min reset token,
  hashed at rest and emailed via SMTP; the non-production SMTP-disabled demo
  response can expose a local-only token but the mailer never logs it and production never returns it
- POST /user/reset-password (public) - verify token, set new password
- GET /user/policies - the 10 country statutory policies
- POST /user/employees (SUPERVISOR|MANAGER|HR_ADMIN) - onboard a new hire;
  supervisors: EMPLOYEE in own team only; managers: EMPLOYEE or SUPERVISOR,
  any team; balances auto-created from the chosen country's policy
- POST /leave/apply (EMPLOYEE) - UC-01 with server-side AI-2 flag;
  day count excludes weekends + the EMPLOYEE'S OWN country holidays;
  supports an opaque `Idempotency-Key` so a retry/double-click returns one request
- POST /leave/coverage-check (EMPLOYEE) - AI-2 pre-submission warning
- POST /leave/forecast (EMPLOYEE) - UC-14 what-if: chargeable days, days skipped
  (holiday vs non-working) and balance before/after; saves nothing
- GET /leave/mine, GET /leave/balances, GET /leave/team-calendar
- PUT /leave/:id/cancel (EMPLOYEE) - UC-03: a PENDING request is cancelled
  immediately; an APPROVED one raises a cancellation that routes Supervisor →
  Manager and only restores the balance on final approval
- GET /leave/drafts, PUT /leave/drafts/:id, POST /leave/drafts/:id/submit,
  DELETE /leave/drafts/:id (EMPLOYEE) - UC-14 drafts; submit runs the same rule
  set as /leave/apply
- POST /leave/:id/attachment (EMPLOYEE, owner) - UC-13 attach/replace the MC while
  the request is still open; GET /leave/:id/attachment - owner, that team's
  approvers, or HR only
- GET /leave/:id/ics (EMPLOYEE, owner) - UC-14 iCalendar export of approved leave
- GET /leave/pending (SUPERVISOR|MANAGER) - tier queue by role
- PUT /leave/:id/decide (SUPERVISOR|MANAGER) - two-tier workflow, no bypass;
  handles both applications and cancellation requests
- GET /swap/eligible, POST /swap, GET /swap/mine, PUT /swap/:id/accept|decline,
  GET /swap/pending, PUT /swap/:id/decide - UC-27; only equal-cost future leave
  may swap, re-verified inside the paired transaction so no balance can move
- GET /holiday (caller's country or ?country=XX), POST /holiday/import (HR_ADMIN|MANAGER)
- POST /ai/parse (AI-1), GET /ai/summary/:requestId (AI-3)

Role-based access is enforced server-side in `middlewares/auth.js` (`requireRole`).


## M3 verification and email-domain commands

```bash
npm run check
npm run test:unit -- --runInBand
npm run seed:test
npm run test:m3 -- --runInBand
npm test -- --runInBand
npm run migrate:demo-emails -- --confirm=wypledu.online
npm run verify:demo-emails
```

`EMAIL_TEST_MODE=true` plus `EMAIL_TEST_REDIRECT_TO=<controlled inbox>` is an optional development-only mechanism for testing unprovisioned company aliases. It is disabled by default and ignored in production.
