# API Documentation — Jordon's Build

Leave Management System · Platform, Identity & Self-Service vertical.

- **Base URL:** `http://localhost:3001`
- **Content type:** `application/json` on every request and response
- **Authentication:** `Authorization: Bearer <accessToken>` on every protected endpoint

---

## Conventions

### Authentication

A token is issued **only** by `POST /user/2fa/verify`. `POST /user/login` never returns one
— it returns a *challenge*, because two-factor verification is unconditional (see §1).

`validateToken` checks more than the JWT signature. It also looks up the session row for
that token, so a token is rejected if the session was revoked or force-logged-out, if the
account was deactivated, or if the account is currently locked — even when the JWT itself
has not expired.

### Error envelope

Two shapes are returned, depending on where the failure happened:

```jsonc
// Field validation (yup) — one entry per failed rule
{ "errors": ["email must be a valid email", "password at least 1 letter and 1 number"] }

// Business-rule / state failure
{ "message": "Current password is incorrect." }
```

### Status codes used

| Code | Meaning in this API |
|---|---|
| `200` | Success |
| `400` | Validation failure or a broken business rule |
| `401` | Missing / invalid / revoked token, or wrong credentials |
| `403` | Authenticated but not permitted — wrong role, someone else's resource, or inactive account |
| `404` | Resource does not exist |
| `423` | Account locked (3 consecutive failed logins → 15-minute lockout) |
| `429` | Too many verification attempts on one challenge |
| `500` | Unhandled server error |

### Roles

`EMPLOYEE` · `SUPERVISOR` · `MANAGER` · `HR_ADMIN`. Endpoints marked **HR_ADMIN** reject
every other role with `403`.

---

## 1. Authentication & two-factor verification

### `POST /user/login`

Step 1 of 2. Verifies the password and opens a verification challenge. **Never returns an
access token.**

**Request**
```json
{ "email": "hr@innovare.com", "password": "demo123!" }
```

**200 — challenge opened**
```json
{
  "twoFactorRequired": true,
  "stage": "CHOOSE_METHOD",
  "challengeToken": "9f2c…64 hex chars…1ab",
  "methods": [
    { "method": "EMAIL",         "label": "Email",             "destination": "h•••••n@innovare.com", "available": true },
    { "method": "SMS",           "label": "Text message",      "destination": "+••••••0009",          "available": true },
    { "method": "AUTHENTICATOR", "label": "Authenticator app", "destination": "Microsoft / Google Authenticator", "available": true }
  ],
  "expiresInSeconds": 600,
  "message": "Choose how you'd like to receive your verification code."
}
```

An unavailable method is still listed, with `available: false` and a `reason` (e.g. no phone
number on the account), so the UI can show *why* it is disabled.

**Errors**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"message":"Email or password is not correct."}` | Wrong credentials — deliberately identical for unknown email and wrong password, so the endpoint cannot be used to enumerate accounts |
| `403` | `{"message":"This account has not been activated. Please use your invitation link to set a password."}` | `status = INVITED` |
| `403` | `{"message":"This account has been deactivated. Contact HR."}` | `status = DEACTIVATED` |
| `423` | `{"message":"Too many failed attempts — account locked for 15 minutes."}` | Third consecutive failure |
| `423` | `{"message":"Account locked after too many failed attempts. Try again after 3:47:12 PM, or ask HR to unlock."}` | Already locked |

---

### `POST /user/2fa/send`

Chooses the delivery method and issues the code. For `AUTHENTICATOR` nothing is sent — the
user's app already generates it — so this call only records the choice.

**Request**
```json
{ "challengeToken": "9f2c…1ab", "method": "EMAIL" }
```

**200**
```json
{
  "stage": "ENTER_CODE",
  "method": "EMAIL",
  "destination": "h•••••n@innovare.com",
  "delivered": true,
  "expiresInSeconds": 573,
  "message": "We sent a 6-digit code to h•••••n@innovare.com."
}
```

For a **demo account** (`@innovare.com`), or when no SMTP/Twilio is configured, the response
additionally carries `"demoCode": "418322"` so the flow stays demonstrable. Real accounts
never receive this field.

**Errors**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"errors":["method must be one of the following values: EMAIL, SMS, AUTHENTICATOR"]}` | Bad method |
| `400` | `{"message":"This sign-in request has expired. Please sign in again."}` | Challenge expired or already consumed |
| `400` | `{"message":"No phone number is saved on this account. Use email instead."}` | `SMS` chosen without a phone number |
| `400` | `{"message":"No authenticator app is set up on this account. Use email or text instead."}` | `AUTHENTICATOR` chosen before enrolment |
| `429` | `{"message":"Too many codes requested. Please sign in again."}` | More than 3 resends |

---

### `POST /user/2fa/verify`

Step 2 of 2. **The only endpoint that issues an access token.**

**Request**
```json
{ "challengeToken": "9f2c…1ab", "code": "418322" }
```

**200**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "user": {
    "id": 9, "name": "Aisha Rahman", "email": "hr@innovare.com",
    "role": "HR_ADMIN", "country": "SG", "team": "Compliance Team A",
    "initials": "AR", "locale": "en"
  }
}
```

**Errors**

| Code | Body | Cause |
|---|---|---|
| `400` | `{"errors":["code must be 6 digits"]}` | Malformed code |
| `400` | `{"message":"That code is not correct. 4 attempts remaining."}` | Wrong code; the counter is included so the user knows where they stand |
| `400` | `{"message":"This verification request is invalid or has expired. Please sign in again."}` | Expired, consumed, or unknown challenge |
| `400` | `{"message":"No code has been sent yet. Choose email or text message first."}` | `/2fa/send` was skipped |
| `429` | `{"message":"Too many incorrect codes. Please sign in again to get a new code."}` | 5 wrong attempts — the challenge is burned |

---

### `GET /user/auth` 🔒

Restores a session on page refresh.

**200** — `{ "user": { …same shape as above… } }`
**401** — token missing, expired, revoked, or the account is now locked/deactivated.

---

### `POST /user/forgot-password`

**Request** — `{ "email": "weiling@innovare.com" }`

**200** — always the same message regardless of whether the address exists, so the endpoint
cannot be used to discover which emails are registered:
```json
{ "message": "If that email is registered, a reset link has been sent." }
```
With no SMTP configured the response also carries `resetToken` and `resetLink` so the flow
is demonstrable.

---

### `POST /user/reset-password`

**Request**
```json
{ "token": "3b1f…", "password": "NewPassw0rd" }
```

**200** — `{ "message": "Password updated. You can now sign in with your new password." }`
**400** — `{"message":"This reset link is invalid or has expired. Please request a new one."}`

---

## 2. Authenticator app (TOTP) enrolment 🔒

### `POST /user/2fa/totp/setup`

Mints a secret and returns a QR code. The secret is stored **pending** until confirmed.

**200**
```json
{
  "manualKey": "JBSWY3DPEHPK3PXP",
  "otpauthUrl": "otpauth://totp/Innovare%20LMS:hr@innovare.com?secret=…&issuer=Innovare%20LMS",
  "qrDataUrl": "data:image/png;base64,iVBORw0KGgo…",
  "issuer": "Innovare LMS",
  "message": "Scan the QR code with your authenticator app, then enter the 6-digit code it shows to finish."
}
```

### `POST /user/2fa/totp/enable`

Confirms the pending secret with a live code, then activates it.

**Request** — `{ "code": "735019" }`
**200** — `{ "message": "Authenticator app enabled. You can now use it to verify sign-ins.", "totpEnabled": true }`

| Code | Body | Cause |
|---|---|---|
| `400` | `{"errors":["code must be 6 digits"]}` | Malformed |
| `400` | `{"message":"Start setup first — no pending authenticator secret."}` | `/setup` not called |
| `400` | `{"message":"That code isn't right. Make sure your phone's time is automatic, then try the current code."}` | Wrong code — the hint is included because clock drift is the usual cause |

### `POST /user/2fa/totp/disable`

Requires the account password, so someone at an unlocked screen cannot silently strip a
security factor.

**Request** — `{ "password": "demo123!" }`
**200** — `{ "message": "Authenticator app turned off. You'll verify sign-ins by email or text.", "totpEnabled": false }`
**400** — `{"message":"Password is incorrect."}`

---

## 3. Profile & self-service 🔒

### `GET /user/profile`
**200**
```json
{
  "id": 9, "name": "Aisha Rahman", "email": "hr@innovare.com", "phone": "+6591230009",
  "role": "HR_ADMIN", "country": "SG", "team": "Compliance Team A", "initials": "AR",
  "locale": "en", "notifyEmail": true, "notifyInApp": true, "totpEnabled": true
}
```

### `PUT /user/profile`

Only self-service fields are writable. `role`, `country` and `team` are set by HR and are
ignored if sent.

**Request**
```json
{ "name": "Aisha Rahman", "phone": "+6591230009", "locale": "zh",
  "notifyEmail": true, "notifyInApp": false }
```
**200** — `{ "message": "Profile updated.", "user": { … } }`
**400** — `{"errors":["locale must be one of the following values: en, zh, th, vi, ms, id, ja"]}`

### `PUT /user/password`

**Request** — `{ "currentPassword": "demo123!", "newPassword": "Passw0rd123" }`
**200** — `{ "message": "Password changed successfully." }`
**400** — `{"message":"Current password is incorrect."}` · `{"errors":["password at least 1 letter and 1 number"]}`

### `GET /user/sessions`
**200**
```json
[{ "id": 42, "deviceInfo": "Chrome on Windows", "ipAddress": "127.0.0.1",
   "lastActive": "2026-08-06T09:14:22.000Z", "current": true }]
```

### `PUT /user/sessions/:id/revoke`
**200** — `{ "message": "Session revoked." }`
**403** — revoking a session that belongs to someone else. **404** — unknown session.

### `GET /user/security-log`
**200**
```json
[{ "id": 88, "eventType": "TWO_FACTOR_SUCCESS", "ipAddress": "127.0.0.1",
   "success": true, "createdAt": "2026-08-06T09:14:20.000Z" }]
```

---

## 4. Employee records & account administration 🔒

### `GET /admin/employees` — **HR_ADMIN, MANAGER**

The staff table. Balances are resolved against the **active leave year**, so the list agrees
with the dashboard and reports immediately after a year-end carry-forward.

**200**
```json
[{
  "id": 1, "name": "Tan Wei Ling", "email": "weiling@innovare.com", "role": "EMPLOYEE",
  "country": "SG", "team": "Compliance Team A", "status": "ACTIVE",
  "lockedUntil": null, "lockReason": null,
  "balances": [{ "leaveType": "annual", "entitled": 14, "carried": 5, "used": 7.5, "remaining": 11.5 }]
}]
```

### `POST /admin/employees` — **HR_ADMIN**

**Request**
```json
{ "name": "Jane Tan", "email": "jane@innovare.com", "tempPassword": "Welcome123",
  "role": "EMPLOYEE", "country": "SG", "team": "Compliance Team A" }
```
**200** — `{ "message": "Jane Tan added to Compliance Team A (Singapore)." }`
**400** — `{"message":"Email already exists."}` · `{"message":"No leave policy configured for country XX."}`

### `POST /user/employees` — **SUPERVISOR, MANAGER, HR_ADMIN**

The Manager-page "Add employee" form. Same provisioning, different entry point.

**403** — `{"message":"Supervisors can only add EMPLOYEE accounts. Ask a Manager to add supervisors."}`

### `POST /admin/employees/import` — **HR_ADMIN**

Bulk import. Excel workbooks are converted to CSV **in the browser**, so this endpoint only
ever receives CSV text.

**Request**
```json
{ "csv": "name,email,role,country,team\nJane Tan,jane@innovare.com,EMPLOYEE,SG,Compliance Team A" }
```
**200**
```json
{ "message": "2 employee(s) imported.", "created": 2,
  "skipped": [{ "row": 4, "reason": "Email already exists." }] }
```
A header row is optional. Valid rows are still created when others fail; each failure is
reported with its row number rather than aborting the whole import.

### Account actions — **MANAGER, HR_ADMIN**

| Endpoint | Success | Notable errors |
|---|---|---|
| `GET /user/locked` | list of locked accounts | |
| `PUT /user/:id/unlock` | `{"message":"Marcus Lim unlocked and can sign in again."}` | `404` unknown user |
| `PUT /user/:id/force-logout` | `{"message":"3 session(s) ended and Marcus Lim's account is locked until you unlock it.","revoked":3}` | `400` `"Use Log out to end your own session."` |
| `PUT /user/:id/deactivate` | `{"message":"Marcus Lim has been removed. Their leave history is kept for records, and 2 active session(s) were ended."}` | `400` `"You cannot deactivate your own account."`; `400` `"This is the only active HR admin. Add another before removing this one."` |
| `PUT /user/:id/reactivate` | `{"message":"Marcus Lim has been restored and can sign in again."}` | `400` `"Marcus Lim is not deactivated."` |
| `DELETE /user/:id` | `{"message":"Marcus Lim and all of their records have been permanently deleted."}` | `400` `"You cannot delete your own account."`; `400` `"Remove the account first, then it can be permanently deleted."` |

`DELETE` is irreversible and runs in a transaction, removing every record that references
the user so no orphans are left behind.

---

## 5. Entitlement & year-end carry-forward 🔒 **HR_ADMIN**

### `GET /admin/carry-forward/preview?fromYear=2026`

Read-only. Shows exactly what a run would do, before anything is written.

**200**
```json
{
  "fromYear": 2026, "toYear": 2027, "employees": 10,
  "totalCarried": 50, "totalForfeited": 78.5,
  "rows": [{ "userId": 6, "name": "Diana Koh", "country": "SG",
             "unused": 20, "cap": 5, "carried": 5, "forfeited": 15, "newEntitled": 21 }]
}
```

### `POST /admin/carry-forward/trigger`

**Request** — `{ "fromYear": 2026 }` (defaults to the active leave year)
**200** — `{ "message": "Carry-forward 2026→2027 complete for 10 employee(s).", "fromYear": 2026, "toYear": 2027, "summary": [ … ] }`

### `GET /admin/entitlement/preview?year=2026` · `POST /admin/entitlement/commit`

Bulk entitlement reset to each country's statutory figure.

**200 (commit)** — `{ "message": "Entitlements updated for 10 employee(s) in 2026.", "year": 2026, "updated": 10 }`

> **These two are deliberately different.** Carry-forward rolls an employee's *existing*
> entitlement into the new year (preserving an above-statutory figure); bulk entitlement
> *resets* everyone to their country's statutory minimum. They will show different numbers
> for anyone above the floor.

### `POST /admin/entitlement/prorate`

**Request** — `{ "fullEntitlement": 14, "startDate": "2026-07-01" }`
**200** — `{ "fullEntitlement": 14, "startDate": "2026-07-01", "prorated": 7 }`

---

## 6. Invitations & onboarding

### `POST /invitation` 🔒 **HR_ADMIN**

**Request**
```json
{ "name": "Jane Tan", "email": "jane@innovare.com", "country": "SG",
  "team": "Compliance Team A", "role": "EMPLOYEE", "startDate": "2026-09-01" }
```
**200**
```json
{ "message": "Invitation created for jane@innovare.com",
  "email": "jane@innovare.com",
  "link": "http://localhost:3000/?inviteToken=7c4e…",
  "expiresAt": "2026-08-08T09:00:00.000Z", "emailed": false }
```
`link` is returned so the flow works without SMTP. **400** — `{"message":"An active account already exists for that email."}`

### `GET /invitation/verify?token=…` *(public)*

Called by the account-creation page to render the invitee's details.

**200** — `{ "email": "jane@innovare.com", "name": "Jane Tan", "country": "SG", "team": "Compliance Team A", "role": "EMPLOYEE" }`
**400** — `{"message":"This invitation is invalid or has expired."}`

### `POST /invitation/accept` *(public)*

**Request**
```json
{ "token": "7c4e…", "password": "Passw0rd123", "phone": "+6591234567",
  "locale": "en", "notifyEmail": true, "notifyInApp": true }
```
**200** — `{ "message": "Your account is ready. Please sign in." }`

### `POST /invitation/totp/setup` · `POST /invitation/totp/enable` *(public, invite-token authorised)*

Lets a new hire enrol an authenticator app **during onboarding**, before any account exists
to log into. Authorised by the invitation token itself, and re-checked as live on both
calls. Same request/response shapes as the logged-in versions in §2.

### `GET /invitation` 🔒 **HR_ADMIN**

**200**
```json
[{ "id": 3, "email": "jane@innovare.com", "name": "Jane Tan", "role": "EMPLOYEE",
   "status": "PENDING", "expiresAt": "2026-08-08T09:00:00.000Z", "invitedByName": "Aisha Rahman" }]
```
`status` ∈ `PENDING` · `ACCEPTED` · `CANCELLED` · `EXPIRED`.

### `PUT /invitation/:id/resend` · `PUT /invitation/:id/cancel` 🔒 **HR_ADMIN**

Resend issues a **new** token and a fresh 48-hour window, invalidating the old link.

**400** — `{"message":"This invitation has already been accepted."}`

---

## 7. Announcements

### `GET /announcement/active` 🔒

Announcements targeted at the caller, inside their display window, not yet acknowledged.
The window is evaluated in **Singapore time**.

**200**
```json
[{ "id": 5, "title": "Office closed Friday", "body": "The office will be closed…",
   "requiresAck": false, "createdByName": "Aisha Rahman",
   "startDate": "2026-08-06", "endDate": "2026-08-08" }]
```

### `POST /announcement/:id/ack` 🔒
**200** — `{ "message": "Acknowledged." }` (idempotent) · **404** — unknown announcement

### `GET /announcement` · `POST /announcement` · `PUT /announcement/:id/deactivate` 🔒 **HR_ADMIN**

**POST request**
```json
{ "title": "Office closed Friday", "body": "The office will be closed for maintenance.",
  "targetType": "COUNTRY", "targetValue": "SG",
  "startDate": "2026-08-06", "endDate": "2026-08-08", "requiresAck": false }
```

| Code | Body | Cause |
|---|---|---|
| `400` | `{"errors":["title must be at least 3 characters"]}` | Validation |
| `400` | `{"message":"endDate must be on or after startDate."}` | Inverted window |
| `400` | `{"message":"targetValue is required for COUNTRY/ROLE targeting."}` | Target without a value |

`GET /announcement` adds `ackCount` per announcement for HR.

---

## 8. Reference data & notifications 🔒

| Endpoint | Purpose |
|---|---|
| `GET /user/policies` | Country policy list — drives the country dropdown and the entitlement shown when adding an employee |
| `GET /notification` | In-app notifications for the caller |
| `GET /notification/unread-count` | Badge count for the header bell |
| `PUT /notification/:id/read` · `PUT /notification/read-all` | Mark as read |

---

## 9. Endpoints retained from another vertical

The HR Admin **Leadership approvals** tab uses two endpoints that live in Member 3's router,
retained here as a dependency:

### `GET /leave/pending` 🔒 **SUPERVISOR, MANAGER, HR_ADMIN**

For `HR_ADMIN` this returns the **leadership queue** — pending requests from a Manager or
another HR Admin, which have no same-tier peer who could approve them without a conflict of
interest. The caller's own request is always excluded.

### `PUT /leave/:id/decide` 🔒

**Request** — `{ "approve": true }` or `{ "approve": false, "rejectionReason": "Coverage too thin that week" }`

| Code | Body | Cause |
|---|---|---|
| `400` | `{"message":"Rejection reason is required (minimum 5 characters)."}` | Reject without a reason |
| `403` | `{"message":"You cannot act on your own leave request."}` | Self-approval attempt — enforced server-side, not just hidden in the UI |
| `403` | `{"message":"You are not authorised to act on this request."}` | Not the right approver for this request |

`GET /leave/balances` is likewise retained, for the reduced employee view.
