# Member 1 – Platform, Identity & Self-Service Engineer

Extracted from `leave-app-complete_3.zip`. This bundle contains the files **Member 1**
built for the Leave Management System, laid out in the same `server/` + `client/`
structure as the original repo so it drops straight back in.

**Member 1's use cases:** UC-09 (mobile-responsive shell), UC-20 (bulk entitlement &
pro-ration), UC-23 (self-service profile & preferences), UC-24 (invitation &
onboarding), UC-25 (session management & security log), UC-26 (system announcements).
Plus the shared platform foundations the whole team builds on: JWT auth, RBAC, the
database schema/model registry, and the responsive frontend shell.

---

## 1. Files Member 1 owns (built end-to-end)

### Backend

| File | Purpose | UC |
|---|---|---|
| `server/middlewares/auth.js` | JWT verify (`validateToken`) + RBAC guard (`requireRole`) | Auth / RBAC |
| `server/models/User.js` | Core identity model | Schema |
| `server/models/UserInvitation.js` | Single-use 48h invite tokens | UC-24 |
| `server/models/UserSession.js` | Active sessions | UC-25 |
| `server/models/SecurityEvent.js` | Login / logout / failed-attempt / lockout log | UC-25 |
| `server/models/Announcement.js` | System broadcasts (target + schedule) | UC-26 |
| `server/models/AnnouncementAck.js` | Read / acknowledge tracking | UC-26 |
| `server/routes/user.js` | Login, `/me`, profile, password, notification prefs, sessions, security log, HR unlock/force-logout, 3-strike lockout | Auth, UC-23, UC-25 |
| `server/routes/invitation.js` | Invite send, token registration, onboarding | UC-24 |
| `server/routes/announcement.js` | Compose / target / schedule / active / ack | UC-26 |
| `server/services/sessionService.js` | Session tracking, security-event logging, 3-strikes / 15-min lockout | UC-25 |
| `server/services/entitlementService.js` | Bulk yearly entitlement + new-joiner pro-ration (preview-then-commit) | UC-20 |
| `server/services/provisioning.js` | Create user + country-policy balances in one place (used by register, add-employee, seeder) | UC-24 / shared |

### Frontend

| File | Purpose | UC |
|---|---|---|
| `client/src/pages/Login.jsx` | Login, register, forgot-password, invite/onboarding tour | UC-24, Auth |
| `client/src/components/ProfilePanel.jsx` | Profile, notification prefs, password change, active sessions | UC-23, UC-25 |
| `client/src/components/AnnouncementBanner.jsx` | Banner/modal + mandatory-acknowledge blocking | UC-26 |

---

## 2. Shared platform Member 1 initialised (used by every member)

Per the Implementation Plan, Member 1 scaffolded the monorepo and owns the shared
foundations. These are included because Member 1 authored/owns them, but note the
rest of the team consumes them.

| File | Purpose |
|---|---|
| `server/index.js` | Express app bootstrap; mounts every member's routes (route sections are labelled `M1`–`M5`) |
| `server/models/index.js` | Sequelize model registry (schema ownership) |
| `server/package.json`, `server/.env.example`, `server/.gitignore` | Backend scaffolding & env config |
| `client/src/App.jsx` | Role-based navigation shell + protected routing (UC-09) |
| `client/src/main.jsx` | Frontend entry / bootstrap |
| `client/src/index.css` | Responsive layout + shared component styling (UC-09) |
| `client/src/lib/http.js` | Shared HTTP client (auth header injection) |
| `client/vite.config.js`, `client/tailwind.config.js`, `client/postcss.config.js`, `client/package.json`, `client/index.html`, `client/.env.example`, `client/.gitignore` | Frontend scaffolding & build config |

---

## 3. Co-owned file – Member 1 slices only

`client/src/pages/Admin.jsx` is **primarily Member 5's** HR admin panel, but Member 1's
UC-20 (bulk entitlement / pro-ration) and UC-25 (HR lockout / force-logout) controls
are embedded inside it and share its local component state (`busy`, `load()`, `form`).
They can't be lifted into a standalone file without refactoring, so the full `Admin.jsx`
is **not** copied here. Member 1's exact contributions are reproduced for reference in:

- `client/src/pages/Admin.MEMBER1-slices.jsx.txt`

Member 1's lines in the original `Admin.jsx`:
- `bulkEntitlement()` handler + "Apply bulk entitlement" button (UC-20) – lines ~166-172, ~190
- `unlock()` / `forceLogout()` / `isLocked()` handlers (UC-25) – lines ~173-184
- Lockout badge + unlock / force-logout buttons in the employee row (UC-25) – lines ~231-262
- Pro-ration start-date input on the Add-employee form (UC-20) – line ~762

---

## 4. Cross-vertical contracts (from the task allocation)

- **RBAC layer** (`auth.js`) enforces UC-08 role visibility centrally for all members.
- **Responsive shell + shared components** are consumed by every member; each makes
  their own screens responsive (UC-09).
- **Notification preferences** (UC-23, in `routes/user.js`) are read by Member 3's
  notification service – the event-type enum must stay in sync.
- **Invitation → pro-ration handoff:** onboarding (UC-24) triggers the pro-ration
  logic (UC-20) on activation – both are self-contained within Member 1.

---

## 5. Notes for running standalone

This bundle is Member 1's slice, not a runnable full app. To run it you would need the
other members' models/routes referenced by `server/index.js` and `server/models/index.js`
(e.g. LeaveRequest, Notification, Coverage, Report), plus the sibling pages
(`Employee.jsx`, `Approver.jsx`, `Admin.jsx`) that `App.jsx` routes to. Use the original
full repo to run; use this bundle for Member 1's review, grading, or code hand-off.

## Structure

- `frontend/` — React application (`client/` in the original bundle)
- `backend/` — Node / Express API (`server/` in the original bundle)
- `docs/` — documentation (per-student + group architecture)
- `tests/` — unit tests (per-student)
- `ai/` — AI submission logs and reflections (per-student)
