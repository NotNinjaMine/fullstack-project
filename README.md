# Leave Management System

**Platform, Identity & Self-Service Engineer** — Innovare Management Singapore
(SCCCI AI Challenge Problem 2B, Group 4).

## Documentation

| Document | Contents |
|---|---|
| `Member1_Scope_UseCases_and_Tasks.md` | Use-case specifications and task breakdown |
| `docs/api-documentation.md` | Every endpoint, with example requests, responses and error codes |
| `docs/database-schema.md` | ER diagram, table definitions and all relationships |
| `docs/testing.md` | Test strategy, what each suite covers, and known gaps |
| `docs/ai-reflection.md` | Reflection on AI use in development — value and required modifications |

---

## What's included

| Feature | Where to see it | UC |
|---|---|---|
| Login / logout | Sign-in screen | UC-25 |
| Two-factor verification (email / SMS / authenticator app) | After entering your password | UC-25 |
| Forgot password + reset | "Forgot password?" on the sign-in screen | UC-23 |
| Account profile — details, password, authenticator, sessions, security log | Header → **My account** | UC-23, UC-25 |
| Multi-language UI | My account → Details → Preferred language | UC-23 |
| Responsive layout | Resize the window / open on a phone | UC-09 |
| View switcher (leadership ↔ employee view) | Header → **Apply for leave** *(Supervisor / Manager / HR Admin only)* | — |
| Add employees | Manager page → **Add employee**; HR Admin → Employees tab | UC-10 |
| Unlock / force-logout / deactivate / reactivate / delete accounts | Manager page and HR Admin → Employees tab | UC-10, UC-25 |
| CSV **and Excel** staff import | HR Admin → Employees → Bulk import | UC-10 |
| Year-end carry-forward (preview → confirm) | HR Admin → Employees | UC-04 |
| Bulk entitlement update / pro-ration | HR Admin → Employees | UC-20 |
| Leadership approvals | HR Admin → Leadership approvals | UC-10 |
| Announcements (compose, target, banner/modal, acknowledge) | HR Admin → Announcements | UC-26 |
| Invitations (send, resend, cancel) + onboarding page | HR Admin → Invitations | UC-24 |

---

## Run order

1. MySQL: `CREATE DATABASE leave;`
2. `cd server && npm install && cp .env.example .env` — edit DB credentials + `APP_SECRET`
3. `npm run seed` then `npm run dev` (API on **:3001**)
4. `cd ../client && npm install && cp .env.example .env`
5. `npm run dev` (app on **:3000**)

Email and SMS are optional. With nothing configured, invitation links, reset links and 2FA
codes are printed to the server console **and** shown on screen, so every flow is
demonstrable with zero setup. To send for real, fill in the SMTP / Twilio section of
`server/.env`.

---

## Demo accounts

Password for all: `demo123!`

| Account | Role | Use it to demo |
|---|---|---|
| `hr@innovare.com` | HR_ADMIN | All four HR tabs, view switcher |
| `hr2@innovare.com` | HR_ADMIN | Second HR Admin — see below |
| `diana@innovare.com` | MANAGER | Add employee, account actions, view switcher |
| `marcus@innovare.com` | SUPERVISOR | Read-only staff table, view switcher |
| `weiling@innovare.com` | EMPLOYEE | Employee view (no switcher — an employee has nowhere to switch to) |

Demo accounts are placeholders, so their 2FA codes appear **on screen** rather than being
emailed or texted. Real accounts you create never do this. `npm run seed` also enrols every
demo account for the authenticator app and prints a scannable QR code per account — add one
to Microsoft Authenticator / Google Authenticator to demo that path with a real phone.

---

## Suggested demo walkthrough

1. **Sign in** as `hr@innovare.com` → pick a 2FA method → the code is shown on screen → verify.
2. **My account** → change language and watch the panel re-label live → look at Sessions and
   the Security log → enrol the authenticator app.
3. **Employees tab** → search the staff table → unlock or deactivate an account → import a
   handful of staff from a `.xlsx` file → run **Apply bulk entitlement** and **Run year-end
   carry-forward**, using the preview before confirming.
4. **Leadership approvals** → Diana (a Manager) has applied for her own leave. It appears
   here because no same-tier peer can approve it. Note that **Aisha's own request is not in
   her list** — sign in as `hr2@innovare.com` and it is in his, which is the self-approval
   rule working in both directions.
5. **Invitations** → send an invite → copy the link → open it in a private window → the
   account-creation page opens directly (not a dashboard) → set a password, optionally enrol
   an authenticator app → sign in as the new employee.
6. **Announcements** → publish one → it appears immediately as a banner (or a blocking modal
   if acknowledgement is required).
7. **View switcher** → as HR Admin or Manager, click **Apply for leave** in the header to
   move to the employee view, then back again.

---

## Tests

```
cd server && npx jest
```

Covers the pure-function logic retained in this build (working-day calculation and
entitlement pro-ration, plus the notification service). Member 3's integration tests, which
need the approval and delegation routers, are not part of this deliverable.
