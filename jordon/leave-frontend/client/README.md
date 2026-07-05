# Leave Management — Frontend (Employee Experience)

Owner role: **Frontend Lead — Employee Experience**
Owned use cases: **UC-01** (Login), **UC-03** (Apply Leave), **UC-08** (Employee Dashboard), **UC-09** (Leave Calendar).

This package contains **only the client** for the employee-facing side of the
multi-country annual leave system. Manager/HR admin screens, the backend API,
the database, and the AI parsing service are owned by other team members.

## Stack

React 18 + Vite, MUI v5, Formik + Yup, axios, react-toastify, dayjs,
`@mui/x-date-pickers` (leave form), and `react-big-calendar` (calendar view).
Layout is responsive via MUI `Grid` breakpoints.

## Run

```bash
npm install
npm run dev
```

Set the backend URL in `.env.development` (defaults to `http://localhost:3001`).

## Files

| File | Use case | Purpose |
| --- | --- | --- |
| `src/pages/Login.jsx` | UC-01 | Employee login (JWT stored in localStorage). |
| `src/pages/ApplyLeave.jsx` | UC-03 | Leave application form (type, date range, reason). |
| `src/components/AiLeaveInput.jsx` | UC-03 | AI-1 natural-language box that prefills the form. |
| `src/pages/Dashboard.jsx` | UC-08 | Balance summary + the employee's own requests. |
| `src/pages/LeaveCalendar.jsx` | UC-09 | My/Team leave calendar. |
| `src/App.jsx` | — | Nav bar + routes for the four screens above. |
| `src/http.js` | — | axios instance with JWT + 401/403 handling. |
| `src/contexts/UserContext.js` | — | Logged-in user state. |

## API contract (what the backend must provide)

All endpoints are relative to `VITE_API_BASE_URL`. Authenticated calls send
`Authorization: Bearer <token>`.

- `POST /user/login` → `{ accessToken, user: { id, name, email, role } }`
- `GET  /user/auth` → `{ user }` (session restore)
- `GET  /leave/types` → `[ { id, code, name } ]`
- `GET  /leave/balance` → `{ year, leaveType, entitled, carriedForward, taken, pending, available }`
- `GET  /leave/mine` → `[ { id, leaveType, startDate, endDate, workingDays, reason, status, createdAt } ]`
- `POST /leave` with `{ leaveTypeId, startDate, endDate, reason }` → created request
  (server computes the authoritative `workingDays`, excluding the employee's country holidays)
- `GET  /leave/calendar?scope=mine|team` → `[ { id, title, employeeName, start, end, status } ]`
  (dates are ISO `YYYY-MM-DD`; `end` is **inclusive** — the client adds a day for the calendar view)
- `POST /ai/parse-leave` with `{ text }` → `{ leaveTypeCode, startDate, endDate, reason, confidence }`
  (owned by the AI teammate; this client only sends the sentence and prefills the form)

Statuses used by the UI: `pending`, `approved`, `rejected`, `cancelled`.

## Boundaries / notes

- No registration screen — staff accounts come from the HR import owned by the DB/DevOps role.
- The AI box never submits on its own; it only pre-fills the form for the employee to review.
- The client's working-days figure on the form is an estimate (weekends only). The
  backend value is authoritative because it also excludes each country's public holidays.
