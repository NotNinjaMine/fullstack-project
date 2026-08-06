# Leave Management System - Server

Express + Sequelize (MySQL) API following the lab5 project conventions.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your MySQL credentials + APP_SECRET.
   Create the database first: `CREATE DATABASE leave;`
   Optional: SMTP_* for real emails; OPENAI_API_KEY + OPENAI_BASE_URL (OpenRouter)
   for AI-1 parse / improve-remarks (or ANTHROPIC_API_KEY). Leave blank for offline heuristic.
3. `npm run seed` (10 country policies, 200 public holidays for 2026,
   demo accounts, balances, sample requests)
4. `npm run dev`

## Demo accounts (password: demo123!)
| Email | Role | Country |
|---|---|---|
| weiling@innovare.com | EMPLOYEE | SG |
| priya@innovare.com | EMPLOYEE | SG |
| kumar@innovare.com | EMPLOYEE | SG |
| faridah@innovare.com | EMPLOYEE | SG |
| linh@innovare.com | EMPLOYEE | VN |
| somchai@innovare.com | EMPLOYEE | TH |
| marcus@innovare.com | SUPERVISOR | SG |
| diana@innovare.com | MANAGER | SG |

## Routes
- POST /user/register, POST /user/login, GET /user/auth
- POST /user/forgot-password (public) - single-use 30-min reset token,
  hashed at rest; emailed via SMTP or (demo mode) logged + returned
- POST /user/reset-password (public) - verify token, set new password
- GET /user/policies - the 10 country statutory policies
- POST /user/employees (SUPERVISOR|MANAGER|HR_ADMIN) - onboard a new hire;
  supervisors: EMPLOYEE in own team only; managers: EMPLOYEE or SUPERVISOR,
  any team; balances auto-created from the chosen country's policy
- POST /leave/apply (EMPLOYEE) - UC-01 with server-side AI-2 flag;
  day count excludes weekends + the EMPLOYEE'S OWN country holidays
- POST /leave/coverage-check (EMPLOYEE) - AI-2 pre-submission warning
- GET /leave/mine, GET /leave/balances, GET /leave/team-calendar, PUT /leave/:id/cancel
- GET /leave/pending (SUPERVISOR|MANAGER) - tier queue by role
- PUT /leave/:id/decide (SUPERVISOR|MANAGER) - two-tier workflow, no bypass
- GET /holiday (caller's country or ?country=XX), POST /holiday/import (HR_ADMIN|MANAGER)
- POST /ai/parse (AI-1), GET /ai/summary/:requestId (AI-3)

Role-based access is enforced server-side in `middlewares/auth.js` (`requireRole`).
