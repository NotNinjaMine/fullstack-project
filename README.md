# Leave Management System (leave-app)

Innovare Management Singapore - SCCCI AI Challenge Problem 2B (Group 4).
Project structured following the lab5 learning-app conventions and delivered as a ZIP archive.

```
leave-app/
├── server/                  Express + Sequelize (MySQL) API
│   ├── index.js             entry point (CORS, routes, sequelize.sync)
│   ├── seed.js              demo data: npm run seed
│   ├── data/holidays2026.js FULL 2026 public holidays, all 10 countries
│   ├── middlewares/auth.js  validateToken (JWT) + requireRole (RBAC)
│   ├── models/              User, LeaveRequest, LeaveBalance, LeavePolicy,
│   │                        PublicHoliday, AuditLog, Notification, AiInteraction
│   ├── routes/              user, leaveRequest, publicHoliday, ai
│   └── services/            coverage.js (AI-2), ai.js (AI-1),
│                            provisioning.js (country-policy onboarding),
│                            mailer.js (forgot-password email, optional SMTP)
└── client/                  Vite + React + Tailwind
    └── src/
        ├── App.jsx          session restore + role-based routing
        ├── lib/http.js      axios with JWT interceptor
        └── pages/           Login (+ forgot/reset password),
                             Employee (UC-01/08/09, country calendar),
                             Approver (UC-02 + AI-3 + add employee)
```

## ZIP handoff
1. Extract the provided ZIP archive into a working folder.
2. Create the development and dedicated test MySQL schemas.
3. Copy `server/.env.example` to `server/.env`, `server/.env.test.example` to `server/.env.test`, and `client/.env.example` to `client/.env`, then fill in the blank (secret) values for your machine.
4. Install dependencies on the same operating system that will run the application.
5. For an existing database, run `npm run migrate:demo-emails -- --confirm=wypledu.online` followed by `npm run verify:demo-emails` from `server/`.
6. Run the seed/tests, then start the API and client using the included package scripts.

Never package `.env`, `.env.test`, `node_modules`, logs, credentials, or reset/access tokens.

## Local URLs (server and client are separate)

Run the two applications in separate terminals:

```bash
# Terminal 1 — backend API
cd server
npm start

# Terminal 2 — React client
cd client
npm run dev
```

- Open `http://localhost:3000` to use the full React website.
- Open `http://localhost:3001` to check the backend. It must show only:
  `Welcome to the Innovare Leave Management System API.`
- `http://localhost:3001/health` returns a small JSON health response.

The Vite client uses `strictPort: true`, so it will stop with a clear error
instead of silently moving onto the API port when port 3000 is occupied.

## Demo account identifiers
weiling@wypledu.online / priya@wypledu.online / kumar@wypledu.online /
faridah@wypledu.online (EMPLOYEE, SG), linh@wypledu.online (EMPLOYEE, VN),
somchai@wypledu.online (EMPLOYEE, TH), marcus@wypledu.online and
aiden@wypledu.online (SUPERVISOR), diana@wypledu.online and
grace@wypledu.online (MANAGER), hr@wypledu.online (HR_ADMIN).


## Final M3 database and duplicate-submit safeguards

- Current staff demo identifiers use `@wypledu.online`.
- Existing databases are migrated in place; seed also repairs stale legacy rows before creating accounts.
- Server startup refuses active `@innovare.com` or `@innovare.example.test` recipients.
- Final approval uses one stable toast ID and one temporary feedback renderer.
- Approval/comment/delegation/leave-submit actions use same-frame single-flight guards.
- Employee leave submission carries an opaque `Idempotency-Key`; the backend composite unique index prevents one employee/key pair from creating two requests.
- Optional `EMAIL_TEST_MODE` is development-only, disabled by default, and ignored in production.

See `M3_FINAL_VERIFICATION_REPORT.md` for the exact commands that passed and the environment-blocked MySQL/build checks.

## Blackout / restricted periods (UC-18)
HR or a Manager defines restricted windows under **Coverage config → Blackout
periods**. Scope is a dropdown, never free text: either a country (from the
configured leave policies) or a team (Compliance Team A / B).

Two modes:
- **Blocked** — employees cannot apply for those dates at all. The days appear
  in solid red on their calendar and the Submit button is disabled.
- **Special approval** — employees may still apply; the days appear in dashed
  red and the request is flagged for Manager special approval.

Employees see the periods that apply to them (their country, plus their team).
Enforcement is server-side in `POST /leave/apply` and on draft submission, so
the API cannot be bypassed. See `M4_BLACKOUT_CHANGES.md` for details.

## Country-aware calendars & entitlements (UC-06/UC-07)
Every account's `country` decides BOTH what they see and what they get:
- Public-holiday calendar: all 10 countries seeded for 2026 (200 rows,
  from the provided reference file). Log in as `linh@` (Vietnam) or
  `somchai@` (Thailand) to see a different calendar than the SG accounts.
- Statutory entitlement (`leave_policies`): e.g. SG 14–24 annual days,
  TH 8–11 annual + 30 sick with MC. Day calculation excludes THAT
  country's holidays, so leave over Hari Raya never deducts for an
  Indonesian employee, and National Day never deducts for a Singaporean.

## Forgot password
"Forgot password?" on the sign-in page → email → single-use reset code
(30-minute expiry, SHA-256-hashed at rest, identical response whether or
not the email exists). With SMTP_* configured in server/.env a real email
is sent. When SMTP is disabled, the existing non-production-only demo flow may
return a reset token to the local client so the offline prototype remains demonstrable;
it is never logged by the mailer and production never returns it. Do not record or
package demo reset tokens.

## Add employee (Supervisor / Manager)
"+ Add employee" on the approver page:
- SUPERVISOR: can add EMPLOYEE accounts to their own team only.
- MANAGER: can add EMPLOYEE or SUPERVISOR, to any team.
Pick the country and the account is provisioned automatically from that
country's policy — holiday calendar, annual entitlement (clamped to the
statutory min–max) and sick-leave quotas — so the new hire can apply for
leave immediately with a temporary password.

## End-to-end demo
Login weiling → apply (try the AI-1 chips; pick 20-24 Jul for the AI-2 warning)
→ logout → marcus: AI-3 card, approve → logout → diana: final approve
→ login weiling: Approved, balance deducted, calendar updated.
Then: login somchai (TH) to show the Thailand calendar/policy, use
"Forgot password?" to reset an account, and as marcus add a new employee
in any country and log in as them.
Finally: login hr@wypledu.online to open the HR Administration console —
dashboard, employee directory, reports, audit trail, and the AI-4/AI-5
features (see "Full member allocation coverage" below for the full list).

Optional: set ANTHROPIC_API_KEY in server/.env to use the hosted LLM for AI-1
(otherwise a built-in heuristic parser keeps the demo fully offline).

---

## Full member allocation coverage (M1–M5)

The base project (above) delivered M2 (employee experience) and M3 (approval /
delegation / notification). The system now also implements the M1, M4 and M5
verticals so every member's use cases are fulfilled. All additions follow the
same conventions as the base: Sequelize models, yup validation, JWT + RBAC,
the existing `{message}` / `{errors}` / bare-object response shapes,
`sequelize.sync({alter:true})`, offline-first AI with an optional LLM, and the
same `lf-*` Tailwind design tokens. No new runtime dependencies were added.

### New demo account
`hr@wypledu.online` (HR_ADMIN) — opens the HR Administration
console (a new role-specific page, the same way EMPLOYEE→Employee and
SUPERVISOR/MANAGER→Approver).

### M1 — Platform / Identity / Self-Service
- **UC-23 self-service profile & preferences** — "My account" in the header:
  edit name/phone, preferred language, email/in-app notification toggles, and
  change password. Role/country/team stay HR-controlled.
- **UC-24 invitations & onboarding** — HR sends an invitation (Invitations tab);
  the invitee gets a single-use 48-hour link (`/?inviteToken=…`, or the token is
  returned in demo mode) and activates the account by setting a password. The
  new-joiner entitlement is pro-rated from the start date (UC-20).
- **UC-25 sessions & security log** — active-session list with per-session
  revoke, a personal security-event log, and a 3-strikes / 15-minute account
  lockout (HR can unlock or force-logout any user).
- **UC-26 announcements** — HR broadcasts targeted to Everyone / Country / Role,
  shown as a banner; mandatory announcements block the UI until acknowledged,
  and HR sees an acknowledgement count.
- **UC-20 bulk entitlement & pro-ration** — Employees tab: apply the yearly
  statutory entitlement to all staff at once, or preview a pro-rated figure.

### M4 — Coverage / Calendar / Scheduling
- **UC-29 weekend configuration** — per-country working-days map (default
  Mon–Fri). Feeds the single source-of-truth day calculation.
- **UC-19 working-day calculation service** — weekend- and holiday-aware day
  counting (`services/calculationService.js`), unit-tested.
- **UC-17 minimum staffing & heatmap** — configurable per-team minimum
  headcount and a green/amber/red manpower heatmap over a date window.
- **UC-18 blackout periods** — restricted windows that either BLOCK a request
  outright or force Manager SPECIAL_APPROVAL; enforced on apply/submit.

### M5 — HR Admin / Analytics / Automation
- **UC-10 configuration** — HR dashboard, employee directory (with balances),
  CSV bulk import, editable country policies, and a leave-type catalogue.
- **UC-04 carry-forward** — year-end routine (5-day cap, forfeiture logged,
  entitlement reset) with a manual trigger for the demo.
- **UC-22 reporting** — utilisation-by-country, sick-leave trend, carry-forward
  summary and pending-overview reports, each with a chart and CSV export.
- **UC-21 audit trail** — read-only, merged view of leave-request and
  configuration-change audit logs, filterable and exportable.
- **UC-30 scheduled reports** — recurring report deliveries (weekly / monthly /
  quarterly) via a `setInterval` sweep, with an on-demand "run now".
- **AI-4 HR insights chatbot** — natural-language questions are classified
  against a FIXED catalogue of pre-defined queries (never free-form SQL);
  offline keyword classifier by default, optionally LLM-refined. Advisory only.
- **AI-5 anomaly flags** — rule-based forfeiture-risk, burnout, request-
  clustering and coverage-gap flags on the HR dashboard. Advisory only.

### M2 additions (completing the employee experience)
- **UC-13 medical certificate upload** — sick-leave-with-MC requires an attached
  MC (PDF/JPG/PNG); viewable only by the owner, their approvers, and HR.
- **UC-14 drafts** — save a request privately, edit it, then submit (it runs the
  full balance / coverage / blackout checks on submission).
- **UC-27 leave swap** — propose swapping approved dates with a teammate; on the
  teammate's acceptance it routes through Supervisor then Manager, and on final
  approval both requests' dates are swapped atomically (balances unchanged).

## Tests
- `cd server && npm test` runs the jest unit suites. The pure-logic suites
  (`delegationService`, `notificationService`, and the new `newFeatures` suite
  covering the day-calculation, pro-ration, AI-4 classifier and schedule-cadence
  functions) run without a database. `api.m3.integration.test.js` requires a
  running MySQL with seeded demo data.

## Two-step verification (2FA)

**Every** sign-in requires a second step. After the password is accepted the user
requests a 6-digit code by **email**, enters it,
and is then taken to the dashboard for their role.

### How the flow works
1. `POST /user/login` — password checked. **No access token is issued.** The
   response is `stage: "CHOOSE_METHOD"` with an opaque `challengeToken` (no role,
   no API access) and the available methods, each with a *masked* destination.
2. `POST /user/2fa/send { challengeToken, method }` — the chosen method generates
   and delivers the code. Switching method later is instant; resending the *same*
   method is cooldown-limited.
3. `POST /user/2fa/verify { challengeToken, code }` — on success the real JWT is
   issued, a session + `TWO_FACTOR_SUCCESS` event are recorded, and the app routes
   to the Employee / Approver / HR dashboard based on the account's role.

Set `TWO_FACTOR_MODE=optional` in `.env` to fall back to per-user opt-in instead
(only accounts that switched it on under **My account -> 2-step** are challenged).

### Demo details
The final submission uses email for 2-step verification. With no SMTP configured,
the 6-digit code is displayed on the verification screen (clearly marked as demo
mode) outside production so the whole flow can still be shown offline.

### Security properties
- Codes are generated with `crypto.randomInt` and stored **only as SHA-256
  hashes**; comparison is timing-safe.
- 10-minute expiry, single-use (`consumedAt`), and the challenge is **burned
  after 5 wrong codes** to stop brute-forcing a 6-digit number.
- Resend is limited to 3 times with a 30-second cooldown.
- The email destination is **masked** in responses (for example `b•b@x.com`).
- Enabling requires proving you can receive a code first (setup -> code ->
  confirm), so you cannot lock yourself out with an unreachable method.
- Enabling/disabling requires re-entering the password.

### Recovery (important)
If someone loses access to the mailbox that receives codes they can still pass
the password but never the second step, so they would be permanently locked out.
Both **HR** (Employees tab -> "Reset 2-step") and **Managers**
(Approvals -> "Account recovery") can clear it — Managers included so a
2FA-enabled HR admin is always recoverable.

### Delivery setup
- **Email codes** work as soon as `SMTP_*` is set (see the Email section in
  `.env.example`). No extra setup beyond what password-reset emails already need.
- The server reports email delivery status on startup. HR can also check status
  and send a test email from **Admin -> Invitations -> Email delivery**.
- **Demo mode:** if SMTP is not configured, the code is shown on screen outside
  production so the flow can still be demonstrated offline. When SMTP is
  configured, the code is never returned in the API response.
- Phone/SMS delivery is intentionally not part of the final submission.
