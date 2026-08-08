# Database Schema — Jordon's Build

Leave Management System · Platform, Identity & Self-Service vertical.

The schema is defined with Sequelize models under `server/models/` and created by
`sequelize.sync({ alter: true })` on server start, so there is no separate migration step
in this build. Every model gets `id` (INTEGER, auto-increment, primary key), `createdAt`
and `updatedAt` (DATETIME) automatically — those are omitted from the field tables below
to keep them readable.

> **Ownership note.** Schema ownership and migrations sit with Nabil in the team split.
> The tables below are the ones Member 1's use cases create and write; changes to them are
> raised with Nabil so migrations stay in one place.

---

## 1. Entity-relationship diagram

```
                            ┌──────────────────────────┐
                            │          users           │
                            │──────────────────────────│
                            │ PK id                    │
                            │    email        (unique) │
                            │    password  (bcrypt)    │
                            │    role         (ENUM)   │
                            │    country, team         │
                            │    status       (ENUM)   │
                            │    locale                │
                            │    failedLoginCount      │
                            │    lockedUntil, lockReason│
                            │    totpEnabled           │
                            │    totpSecret      (enc) │
                            │    totpPendingSecret(enc)│
                            └────────────┬─────────────┘
                                         │ 1
              ┌──────────────┬───────────┼───────────┬──────────────┐
              │              │           │           │              │
              │ N            │ N         │ N         │ N            │ N
   ┌──────────▼───────┐ ┌────▼────────┐ ┌▼──────────────┐ ┌─────────▼────────┐
   │  user_sessions   │ │security_    │ │two_factor_    │ │ leave_balances   │
   │──────────────────│ │  events     │ │  challenges   │ │──────────────────│
   │ PK id            │ │─────────────│ │───────────────│ │ PK id            │
   │ FK userId        │ │ PK id       │ │ PK id         │ │ FK userId        │
   │    tokenHash     │ │ FK userId   │ │ FK userId     │ │    leaveType     │
   │    deviceInfo    │ │    eventType│ │  challengeTok │ │    year          │
   │    ipAddress     │ │    ipAddress│ │    enHash     │ │    entitled      │
   │    lastActive    │ │    success  │ │    codeHash   │ │    carried       │
   │    revokedAt     │ └─────────────┘ │    method     │ │    used          │
   └──────────────────┘                 │    attempts   │ └──────────────────┘
                                        │    expiresAt  │
                                        │    consumedAt │
                                        └───────────────┘
                                         │ N
                                         │
                            ┌────────────▼─────────────┐
                            │   announcement_acks      │
                            │──────────────────────────│
                            │ PK id                    │
                            │ FK userId                │
                            │ FK announcementId        │
                            └────────────┬─────────────┘
                                         │ N
                                         │ 1
                            ┌────────────▼─────────────┐
                            │      announcements       │
                            │──────────────────────────│
                            │ PK id                    │
                            │    title, body           │
                            │    targetType   (ENUM)   │
                            │    targetValue           │
                            │    startDate, endDate    │
                            │    requiresAck           │
                            │    active                │
                            └──────────────────────────┘

   Standalone (no FK — matched by value, see notes):

   ┌───────────────────────┐   ┌────────────────────────┐   ┌───────────────────────┐
   │   user_invitations    │   │     leave_policies     │   │   config_audit_log    │
   │───────────────────────│   │────────────────────────│   │───────────────────────│
   │ PK id                 │   │ PK id                  │   │ PK id                 │
   │    email              │   │    country    (unique) │   │    action             │
   │    tokenHash          │   │    countryName         │   │    actorName          │
   │    role, country, team│   │    annualMin/Max       │   │    entity, entityId   │
   │    expiresAt          │   │    sickMc, sickNoMc    │   │    before, after (JSON)│
   │    acceptedAt         │   │    carryForwardMax     │   └───────────────────────┘
   │    cancelledAt        │   └────────────────────────┘
   └───────────────────────┘
```

**Cardinality summary**

| Relationship | Type | On delete |
|---|---|---|
| `users` → `user_sessions` | 1 : N | cascade |
| `users` → `security_events` | 1 : N | cascade |
| `users` → `two_factor_challenges` | 1 : N | cascade |
| `users` → `leave_balances` | 1 : N | cascade |
| `users` → `announcement_acks` | 1 : N | cascade |
| `announcements` → `announcement_acks` | 1 : N | cascade |
| `users` → `notifications` | 1 : N | cascade |

---

## 2. Table definitions

### 2.1 `users`

The central identity record. Also carries the security state (lockout, 2FA enrolment) and
the self-service preferences, because all three belong to the same person and are always
read together at sign-in.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | no | auto | |
| `name` | VARCHAR(50) | no | | Letters, spaces and `' - , .` only |
| `email` | VARCHAR(50) | no | | Unique; lower-cased on write; the login identifier |
| `password` | VARCHAR(100) | no | | **bcrypt hash** — never plaintext |
| `role` | ENUM | no | `EMPLOYEE` | `EMPLOYEE` \| `SUPERVISOR` \| `MANAGER` \| `HR_ADMIN` |
| `country` | VARCHAR(2) | no | `SG` | ISO-2; joins to `leave_policies.country` |
| `team` | VARCHAR(50) | no | `Compliance Team A` | |
| `initials` | VARCHAR(3) | no | `??` | Derived from `name` on write |
| `resetTokenHash` | VARCHAR(64) | yes | | SHA-256 of the forgot-password token |
| `resetTokenExpires` | DATETIME | yes | | |
| `phone` | VARCHAR(30) | yes | | Required for SMS 2FA; absent ⇒ that option is offered but disabled |
| `locale` | VARCHAR(5) | no | `en` | `en` `zh` `th` `vi` `ms` `id` `ja` |
| `notifyEmail` | BOOLEAN | no | `true` | |
| `notifyInApp` | BOOLEAN | no | `true` | |
| `status` | ENUM | no | `ACTIVE` | `ACTIVE` \| `INVITED` \| `DEACTIVATED` |
| `failedLoginCount` | INTEGER | no | `0` | Reset to 0 on a correct password |
| `lockedUntil` | DATETIME | yes | | Set 15 min ahead on the 3rd failure |
| `lockReason` | ENUM | yes | | `FAILED_LOGINS` \| `ADMIN` |
| `totpEnabled` | BOOLEAN | no | `false` | Authenticator app enrolled and confirmed |
| `totpSecret` | VARCHAR(255) | yes | | **AES-256-GCM encrypted** TOTP secret |
| `totpPendingSecret` | VARCHAR(255) | yes | | Encrypted; not yet confirmed by a live code |

**Why two TOTP columns.** A secret is minted at setup but only promoted from
`totpPendingSecret` to `totpSecret` once the user proves a working code. An abandoned setup
therefore leaves no half-enrolled account that cannot sign in.

**Why the secret is encrypted, not hashed.** Unlike a password, a TOTP secret must be
*recovered* to verify future codes, so it cannot be one-way hashed. It is encrypted at rest
with a key derived from `APP_SECRET` and only decrypted in memory at verify time.

---

### 2.2 `two_factor_challenges`

One row per sign-in attempt that has passed the password step. A row is the only thing that
can be exchanged for an access token.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | no | auto | |
| `userId` | INTEGER FK → `users.id` | no | | cascade delete |
| `challengeTokenHash` | VARCHAR(64) | no | | SHA-256 of the token handed to the client |
| `codeHash` | VARCHAR(64) | yes | | SHA-256 of the 6-digit code. **Null for `AUTHENTICATOR`** — nothing is sent; the user's app generates it |
| `method` | ENUM | yes | | `EMAIL` \| `SMS` \| `AUTHENTICATOR`; null until chosen |
| `destination` | VARCHAR(120) | yes | | Masked address/number shown back to the user |
| `expiresAt` | DATETIME | no | | 10 minutes from creation |
| `attempts` | INTEGER | no | `0` | Challenge is burned at 5 |
| `resendCount` | INTEGER | no | `0` | Capped at 3 |
| `lastSentAt` | DATETIME | yes | | Drives the resend cooldown |
| `consumedAt` | DATETIME | yes | | Set on success **or** on attempt exhaustion — prevents replay |
| `ipAddress` | VARCHAR(64) | yes | | |

**Security properties.** The raw challenge token and the raw code are never stored, only
their SHA-256 digests. Codes are compared with a timing-safe equality check. A consumed row
can never be reused, so a captured token is worthless after one use.

---

### 2.3 `user_invitations`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | no | auto | |
| `email` | VARCHAR(50) | no | | Matches the placeholder `users` row by value (no FK) |
| `name` | VARCHAR(50) | no | | |
| `country` | VARCHAR(2) | no | `SG` | |
| `team` | VARCHAR(50) | no | `Compliance Team A` | |
| `role` | ENUM | no | `EMPLOYEE` | Role the account will be given on acceptance |
| `startDate` | DATE | yes | | Drives pro-rated entitlement (UC-20) |
| `tokenHash` | VARCHAR(64) | no | | SHA-256 of the one-time link token |
| `expiresAt` | DATETIME | no | | 48 hours from send |
| `acceptedAt` | DATETIME | yes | | Non-null ⇒ link is spent |
| `cancelledAt` | DATETIME | yes | | Non-null ⇒ HR revoked it |
| `invitedByName` | VARCHAR(50) | no | | |

**Why no foreign key to `users`.** The invitation is created *before* the account is
usable. A placeholder `users` row with `status = 'INVITED'` is created alongside it and
matched by `email`, so the invitee occupies their org slot immediately while remaining
unable to sign in. Expired placeholders are purged on the next employee-list read.

**Live invitation** = `acceptedAt IS NULL AND cancelledAt IS NULL AND expiresAt > NOW()`.

---

### 2.4 `user_sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | INTEGER PK | no | |
| `userId` | INTEGER FK → `users.id` | no | cascade delete |
| `tokenHash` | VARCHAR(64) | no | SHA-256 of the issued JWT |
| `deviceInfo` | VARCHAR(200) | yes | Parsed from the `User-Agent` header |
| `ipAddress` | VARCHAR(64) | yes | |
| `lastActive` | DATETIME | yes | Refreshed by `validateToken` |
| `revokedAt` | DATETIME | yes | Non-null ⇒ token rejected even if not expired |

Storing the token hash is what makes **revocation** and **force-logout** possible: a JWT is
otherwise valid until it expires, so `validateToken` checks this table on every request and
rejects a token whose session row is missing or revoked.

---

### 2.5 `security_events`

Append-only audit of everything that happens to an account's access.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | INTEGER PK | no | |
| `userId` | INTEGER FK → `users.id` | no | cascade delete |
| `eventType` | ENUM | no | see below |
| `ipAddress` | VARCHAR(64) | yes | |
| `success` | BOOLEAN | no | default `true` |

`eventType` ∈ `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_CHANGE`, `SESSION_REVOKED`,
`LOCKED`, `UNLOCKED`, `TWO_FACTOR_CHALLENGED`, `TWO_FACTOR_SUCCESS`, `TWO_FACTOR_FAILED`,
`TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`, `TWO_FACTOR_RESET`.

---

### 2.6 `announcements`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | no | auto | |
| `title` | VARCHAR(120) | no | | 3–120 chars |
| `body` | VARCHAR(1000) | no | | 3–1000 chars |
| `targetType` | ENUM | no | `ALL` | `ALL` \| `COUNTRY` \| `ROLE` |
| `targetValue` | VARCHAR(20) | yes | | Country code or role name; null when `ALL` |
| `startDate` | DATE | no | | |
| `endDate` | DATE | no | | Must be ≥ `startDate` |
| `requiresAck` | BOOLEAN | no | `false` | `true` ⇒ blocking modal instead of a banner |
| `createdByName` | VARCHAR(50) | no | | |
| `active` | BOOLEAN | no | `true` | Set false by "End" |

**Display window is evaluated in Singapore time**, not server UTC. See
`services/dateService.js` — a UTC server is 8 hours behind SGT, so a UTC-based "today"
would hide an announcement starting today for the first 8 hours of every Singapore day.

---

### 2.7 `announcement_acks`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | INTEGER PK | no | |
| `announcementId` | INTEGER FK → `announcements.id` | no | cascade delete |
| `userId` | INTEGER FK → `users.id` | no | cascade delete |
| `createdAt` | DATETIME | no | Serves as "acked at" |

Written via `findOrCreate` on `(announcementId, userId)`, so acknowledging twice is a no-op.

---

### 2.8 `leave_balances`

Written by Member 1's entitlement provisioning (UC-20) and year-end carry-forward (UC-04).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | no | auto | |
| `userId` | INTEGER FK → `users.id` | no | | cascade delete |
| `leaveType` | VARCHAR | no | | `annual` \| `sick_mc` \| `sick_nomc` |
| `year` | INTEGER | no | | One row per user per type per year |
| `entitled` | DECIMAL | no | `0` | Statutory or adjusted entitlement |
| `carried` | DECIMAL | no | `0` | Brought forward, capped at `carryForwardMax` |
| `used` | DECIMAL | no | `0` | |

Remaining = `entitled + carried − used`.

**Active leave year.** Anything reading a balance resolves the year through
`services/leaveYearService.js`, which returns the highest year any balance row exists for
(never below the real calendar year). Without this, running a year-end carry-forward writes
next year's rows while every screen keeps reading the old year.

---

### 2.9 `leave_policies` *(read-only for Member 1)*

Owned by Member 4; consumed here to decide entitlement.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `country` | VARCHAR(2) | Unique; joins from `users.country` |
| `countryName` | VARCHAR | |
| `annualMin` | DECIMAL | Statutory floor — the default for a new hire |
| `annualMax` | DECIMAL | Ceiling accepted when HR sets a custom entitlement |
| `sickMc` | DECIMAL | Sick days with a medical certificate |
| `sickNoMc` | DECIMAL | Sick days without |
| `carryForwardMax` | DECIMAL | Cap on days carried into the new year |

---

### 2.10 `config_audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `action` | VARCHAR | Human-readable summary |
| `actorName` | VARCHAR | Who did it |
| `entity` | VARCHAR | `users`, `leave_balances`, … |
| `entityId` | VARCHAR | |
| `before` / `after` | JSON | State snapshots |

Written by employee creation, CSV/Excel import, carry-forward and bulk entitlement.

---

## 3. Notes on delete behaviour

Two different operations, deliberately distinct:

| Operation | Endpoint | Effect |
|---|---|---|
| **Deactivate** | `PUT /user/:id/deactivate` | `status = DEACTIVATED`, all sessions revoked. Leave history and balances are **kept** for records. Reversible. |
| **Permanent delete** | `DELETE /user/:id` | Row-by-row removal of the user *and* every record referencing them, inside a transaction. Irreversible; only allowed on an already-deactivated account. |

Permanent delete deliberately reaches across tables owned by other members (leave requests,
comments, delegations, swaps, attachments, notifications, AI interactions) because leaving
orphaned rows behind would break their screens. It is guarded so that a user cannot delete
themselves, and the last remaining active HR admin cannot be removed.
