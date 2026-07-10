# LeaveFlow

Full-stack leave management app: **FIGMA LeaveFlow UI** + **Grok Express/SQLite backend**.

Plain JavaScript only (`.js` / `.jsx`). No TypeScript in the final app.

| Layer | Source |
|---|---|
| Backend | Grok (`backend/`) — kept whole |
| Frontend scaffold | Grok (router, Auth/Notification/Theme contexts, services) |
| Frontend look | FIGMA design tokens + UI kit + 8 pages |
| Login | FIGMA-styled page → Grok `authService` |

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- **PowerShell** (Windows) or any shell
- No Postgres required for the demo — uses **SQLite**

---

## Run (PowerShell)

From the repo root (`grok-gptsol5.6-main/`):

### 1. Backend

```powershell
cd backend
Copy-Item .env.example .env   # only if .env is missing
# Ensure in .env:
#   DB_DRIVER=sqlite
#   JWT_SECRET=<long random string>
#   AI_ASSISTANT_ENABLED=false
#   EMAIL_ENABLED=false
#   WHATSAPP_ENABLED=false
#   REMINDER_ENABLED=false

npm install
# First time (or reset disposable DB):
# $env:ALLOW_SCHEMA_RESET="true"; npm run db:init
npm run seed
npm run dev
```

Backend listens on **http://localhost:3001**

Health check:

```powershell
Invoke-RestMethod http://localhost:3001/health
# → { success: true, data: { status: "ok", ... } }
```

### 2. Frontend (second terminal)

```powershell
cd frontend
Copy-Item .env.example .env   # only if missing
# VITE_API_URL=http://localhost:3001

npm install
npm run dev
```

App: **http://localhost:5173**

Production build:

```powershell
cd frontend
npm run build
```

---

## Seeded test logins

Password for all demo users: **`Password123!`**

| Email | Role |
|---|---|
| `alice.tan@company.com` | employee |
| `bob.supervisor@company.com` | supervisor |
| `carol.manager@company.com` | manager |
| `hr.admin@company.com` | hr_admin |

Also seeded: multi-country staff (`aung.kyaw@…`, `somchai@…`, `li.wei@…`, etc.).

---

## Optional integrations (off by default)

All of these are **env-gated**. With keys missing / flags false they **no-op safely** and never block page loads.

Edit `backend/.env`:

### AI assistant (OpenRouter / OpenAI-compatible)

```env
AI_ASSISTANT_ENABLED=true
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
```

When off or key missing, balance summary and leave tips fall back to static text.

### Email

```env
EMAIL_ENABLED=true
SMTP_MODE=smtp          # or ethereal | console | godaddy
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="HR Leave <noreply@example.com>"
```

### WhatsApp

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=console   # or twilio | meta
# TWILIO_* or WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID for Meta
```

### Telegram

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=...
# Users need telegram_chat_id set in DB
```

### Reminders

```env
REMINDER_ENABLED=true
REMINDER_INTERVAL_MS=3600000
```

---

## Architecture notes

- API envelope: `{ success, data }` or `{ success, code, message }` — frontend services unwrap `res.data.data`.
- UI shape mapping: `frontend/src/lib/adapters.js` (`toBalance`, `toLeaveRow`, `toNotification`, `toProfile`, …).
- Auth token: `localStorage.accessToken` (+ `user`).
- DB drivers: `sqlite` (demo) | `pglite` | `pg`.
- Frontend role guards: `/approvals` → supervisor/manager/hr_admin; `/admin` → hr_admin only.

---

## Project layout (merged)

```
backend/          Grok API (unchanged feature set)
frontend/
  src/
    components/   FIGMA Layout/Navbar/Sidebar/ui + Grok ProtectedRoute
    context/      Auth, Notification, Theme
    services/     axios API clients
    lib/adapters.js
    pages/        Login + 8 FIGMA pages + Delegation (Grok)
```

See `MERGE_PLAN.md` in the parent workspace folder for the original merge specification.
