# Leave Management System — Server (Member 1)

Express + Sequelize backend for **Member 1 — Platform, Identity & Self-Service**.
Implements the M1 vertical end-to-end: JWT auth + bcrypt, RBAC middleware, the
database schema, sessions/security log, invitations & onboarding, announcements,
and bulk entitlement / pro-ration.

## Stack

- **Express 4** — HTTP server & routing
- **Sequelize 6** — ORM. Dialect defaults to **SQLite** (zero-infra, runs
  anywhere) and is switchable to the team's **MySQL** with one env change — the
  models are dialect-agnostic.
- **jsonwebtoken** — JWT auth · **bcryptjs** — password hashing (API-compatible
  with the team's `bcrypt`; pure-JS so it needs no native build)
- **yup** — request validation · **cors**, **dotenv**

## Run

```bash
cd server
npm install
cp .env.example .env      # optional — sensible SQLite/demo defaults if omitted
npm run seed              # 6 demo accounts, 10 country policies, sample data
npm run dev               # or: npm start  → http://localhost:3001
npm test                  # HTTP smoke test covering every M1 endpoint
```

### Switching to the team's MySQL

Set in `.env` (the reference project's `CREATE DATABASE leave;` applies):

```
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PWD=yourpassword
DB_NAME=leave
```

Nothing else changes — the same models/migrations run on MySQL.

## Demo accounts (password `demo123!`)

| Email | Role |
|---|---|
| weiling@innovare.com | EMPLOYEE |
| priya@innovare.com | EMPLOYEE |
| kumar@innovare.com | EMPLOYEE |
| marcus@innovare.com | SUPERVISOR |
| diana@innovare.com | MANAGER |
| hr@innovare.com | HR_ADMIN |

## Endpoints (Member 1 scope)

Responses use the team convention: `{ message }` / `{ errors }` for failures,
bare object/array for success. Every protected route runs `validateToken` then
(where relevant) `requireRole(...)`.

**Auth & identity (UC-01, UC-23)** — `/user`
- `POST /login` · `GET /auth`
- `POST /forgot-password` · `POST /reset-password` (public; 30-min single-use token)
- `GET/PUT /profile` · `PUT /password`
- `GET /policies`

**Sessions & security log (UC-25)** — `/user`
- `GET /sessions` · `PUT /sessions/:id/revoke` · `GET /security-log`
- `PUT /:id/unlock` · `PUT /:id/force-logout` (HR only)
- 3 failed logins → 15-minute lockout

**Announcements (UC-26)** — `/announcement`
- `GET /active` · `POST /:id/ack` (all roles)
- `GET /` · `POST /` · `PUT /:id/deactivate` (HR only)

**Invitations & onboarding (UC-24)** — `/invitation`
- `POST /` · `GET /` (HR only)
- `GET /verify?token=` · `POST /accept` (public) — activation pro-rates the
  new joiner's annual entitlement from their start date (UC-20)

**Bulk entitlement & pro-ration (UC-20)** — `/admin`
- `GET /policies`
- `GET /entitlement/preview?year=` · `POST /entitlement/commit` (HR only)
- `POST /entitlement/prorate` (HR only)

## Notes & scope

- **Demo mode:** with no `SMTP_*` configured, password-reset and invitation
  links are logged to the console and returned in the API response (`demoResetToken`
  / `demoInviteToken`) so the flows work fully offline. Configure SMTP to send
  real email.
- **Audit:** every state-changing admin action (invite, announcement,
  entitlement commit, …) writes a `config_audit_log` row.
- **Out of scope:** the employee-leave, approval, and HR-analytics verticals own
  `/leave`, `/holiday`, `/ai`, etc. This server does not implement them; the
  React client keeps its mock adapter on by default for those. Point the client
  at this backend with `VITE_USE_MOCK_API=false` to exercise the M1 features.
- **Session revocation** is reflected in the UI immediately; full stateless-JWT
  invalidation would additionally check the session table in `authMiddleware`
  (documented in `models/UserSession.js`).
