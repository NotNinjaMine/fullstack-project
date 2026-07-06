# Leave Management System - Server

Express + Sequelize (MySQL) API following the lab5 project conventions.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your MySQL credentials + APP_SECRET.
   Create the database first: `CREATE DATABASE leave;`
3. `npm run seed` (creates demo accounts, balances, holidays, sample requests)
4. `npm run dev`

## Demo accounts (password: demo123!)
| Email | Role |
|---|---|
| weiling@innovare.com | EMPLOYEE |
| priya@innovare.com | EMPLOYEE |
| kumar@innovare.com | EMPLOYEE |
| faridah@innovare.com | EMPLOYEE |
| marcus@innovare.com | SUPERVISOR |
| diana@innovare.com | MANAGER |

## Routes
- POST /user/register, POST /user/login, GET /user/auth
- POST /leave/apply (EMPLOYEE) - UC-01 with server-side AI-2 flag
- POST /leave/coverage-check (EMPLOYEE) - AI-2 pre-submission warning
- GET /leave/mine, GET /leave/balances, GET /leave/team-calendar, PUT /leave/:id/cancel
- GET /leave/pending (SUPERVISOR|MANAGER) - tier queue by role
- PUT /leave/:id/decide (SUPERVISOR|MANAGER) - two-tier workflow, no bypass
- GET /holiday, POST /holiday/import (HR_ADMIN|MANAGER)
- POST /ai/parse (AI-1: LLM if ANTHROPIC_API_KEY set, heuristic fallback otherwise)
- GET /ai/summary/:requestId (AI-3 approval summary card data)

Role-based access is enforced server-side in `middlewares/auth.js` (`requireRole`).
