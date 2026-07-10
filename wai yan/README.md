# HR Leave Management System

Full-stack leave application for the SCCCI AI Challenge.  
**Member 3 scope:** Backend workflow & notifications (+ working frontend for demo).

## Structure

```
frontend/     React 19 + Vite + Tailwind CSS v4 + Axios
backend/      Node.js + Express + PostgreSQL
*.md          Specs (schema, API, use cases, frontend guides)
```

## Quick start

### 1. Backend (SQLite by default — no Postgres install)

```bash
cd backend
npm install
npm run seed           # resets the disposable demo database and creates demo users
npm run db:migrate     # safe, idempotent upgrade path for an existing database
npm run dev            # http://localhost:3001
# optional: npm run smoke  (with server running)
```

Drivers via `backend/.env` → `DB_DRIVER=sqlite` | `pglite` | `pg`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### Demo logins

Password for all: `Password123!`

- `alice.tan@company.com` — employee  
- `bob.supervisor@company.com` — supervisor  
- `carol.manager@company.com` — manager  
- `hr.admin@company.com` — HR admin  

## Features

- JWT auth + role-based access  
- Leave apply / history / cancel  
- Two-tier approval (supervisor → manager)  
- Balance deduct on final approve only  
- Overlap detection + special approval flag  
- In-app notifications (+ email when SMTP configured)  
- Audit log on every state change
- HR-only holiday cache loader: `POST /api/admin/holidays/load`  

## Specs

- `database-schema.md`
- `api-documentation.md`
- `use-cases.md`
- `CLAUDE.md`
- `frontend-architecture.md`
- `frontend-api-integration.md`
