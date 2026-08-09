# Use Cases — Member 1 (Platform, Identity & Self-Service)

**Author:** Jordon · Member 1
**Owned use cases:** UC-04 · UC-09 (responsive layout) · UC-10 (employee records & staff import) · UC-20 · UC-23 · UC-24 · UC-25 · UC-26

My vertical is everything that has to work before anyone can apply for or approve
a single day of leave: who can log in, who they are, what device they're on, and
how HR gets a person into — or out of — the system in the first place. It also
owns the two housekeeping jobs that touch every employee's balance at once: bulk
entitlement resets and the year-end carry-forward.

---

## Actors that touch my use cases

| Actor | Where they appear in my flows |
|---|---|
| **Employee** | Logs in, manages their own profile, sessions and notification preferences; is the subject of the onboarding and entitlement jobs |
| **New Employee** | Completes registration from an invitation link (UC-24) |
| **HR Admin** | Sends invitations, manages employee records and staff import, runs bulk entitlement and carry-forward, composes announcements, force-logs-out and unlocks accounts |
| **Supervisor / Manager / Boss** | Covered by the same login, session and RBAC layer as everyone else — no special-cased flows live in my vertical |
| **System** | Runs the carry-forward sweep, purges expired invitations, evaluates announcement display windows against SGT |

A rule that runs through everything here: **my RBAC middleware is the single gate
every other member's route sits behind.** `requireAuth()` and `requireRole()` run
first on every request; if a route works for the wrong role, that's a bug in my
layer, not in the route that used it.

---

## UC-09 — Responsive layout framework

**Actor:** All roles (indirectly)
**Goal:** every screen — mine and every other member's — works on a phone browser, with no native app.

**What I actually own here.** UC-09 is split with Jervis: she owns the *shared
component library* (buttons, inputs, cards, modals, tables); I own the
*responsive layout shell* that arranges them — breakpoints, the collapsing
side-nav, the mobile header, and the `useViewport()` hook every other member's
screens call to decide what to render.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Narrow viewport with a data-heavy table (staff table, audit log) | Columns collapse into a stacked card view below 640px rather than scrolling horizontally |
| Modal opened on mobile | Becomes a full-screen sheet instead of a centred dialog, so it never clips off-screen |
| Orientation change mid-form | Form state is preserved; only the layout re-flows |
| Very long employee or announcement names | Truncated with an ellipsis and a tooltip — never breaks the grid |

**Known gap.** No native app was built, per client guidance — mobile is
responsive web only. Push notifications are out of scope; mobile users rely on
in-app + email (UC-12, owned by Waiyan).

---

## UC-24 — New employee invitation & onboarding

**Actor:** HR Admin (sends) · New Employee (completes)

**Main flow**

1. HR Admin enters name, email, country, department and reporting line, then sends an invite.
2. The system generates a single-use token, hashes it, and emails a registration link that expires in 48 hours.
3. The new employee opens the link on a **standalone account-creation page** — it doesn't matter whether another account's session is still sitting in that browser; the invite page never reads it.
4. They set a password and are walked through a short first-login tour: confirm country, confirm reporting line, set notification preferences.
5. On completion the account activates and UC-20's pro-ration logic computes their opening entitlement from their start date.
6. HR Admin is notified the invite was accepted.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Link opened after 48 hours | Refused: "This invitation has expired — ask HR to resend it" |
| Link opened twice | Second open is refused once the first registration completes — the token is single-use |
| HR re-invites the same email | Old token is invalidated and a new one issued; there's never two live links for one person |
| Invite never accepted | The placeholder account is purged automatically, so it never clutters the staff table or skews headcount reports |
| New employee's country has no leave policy configured yet | Registration still completes; entitlement shows as 0 until Nabil's policy catalogue has an entry, rather than failing the signup |
| Duplicate email already in the system | Refused at invite time, before a token is ever generated |

**Design note.** Invite tokens are hashed at rest the same way passwords are — if
the invitations table ever leaked, no link in it would still work.

---

## UC-23 — Employee self-service & preferences

**Actor:** Employee (every role, for themselves)

**Main flow**

1. Employee edits their own contact details; country and reporting line are read-only — only HR can change those (UC-10).
2. Employee changes their password (bcrypt-hashed) or uses forgot-password.
3. Employee sets per-event-type notification preferences (email / in-app / both) and picks a UI language.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Employee tries to edit country or reporting line | Field renders disabled; the API rejects the write independently, so it isn't just a UI restriction |
| Password changed while other sessions are active | Other sessions are **not** force-logged-out automatically — left to UC-25 by choice, since the client didn't ask for it and it would be a surprising default |
| Every channel turned off for one event type | Allowed — the employee simply won't be told, at their own risk |
| Locale changed mid-session | Applies from the next page load; i18n dictionaries fall back to English so an untranslated key never renders blank |
| Forgot-password requested for an email that doesn't exist | Same generic confirmation shown either way, so the flow can't be used to enumerate accounts |

---

## UC-25 — Session management & security log

**Actor:** Employee (own sessions) · HR Admin (all users)

**Main flow**

1. Employee opens security settings and sees every active session: device, browser, approximate location, last-active time.
2. They can revoke any session they don't recognise, which forces that session's logout immediately.
3. A personal security log lists every login, logout, failed attempt and password change for the past year.
4. HR Admin can view and force-logout any user's sessions — the offboarding lever.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Revoking the session you're currently on | Allowed — it logs you out too, same as any other session |
| Three failed logins in a row | 15-minute lockout; HR Admin can unlock early from the same panel that shows the security log |
| HR force-logs-out a user mid-request | Their next API call gets a clean 401, not a partial write |
| Session table growing unbounded | Revoked/expired sessions past the 1-year retention window are pruned rather than kept forever |

**As-built note — two-factor authentication was not delivered.** The original
plan called for always-on email / SMS / authenticator-app verification on every
login. It was cut during integration hardening to keep sign-in demoable without a
mail/SMS provider configured, and the session and lockout protections above were
judged sufficient for a prototype. If it's added later, the hook point already
exists — `postPasswordAuth` runs before a session is issued — it just isn't wired
to anything today.

---

## UC-26 — System announcements & maintenance broadcasts

**Actor:** HR Admin

**Main flow**

1. HR Admin composes an announcement: title, body, target audience (all / by country / by role), and a display window.
2. It appears as a banner or modal to targeted users on their next login, inside that window.
3. It's either dismissible or mandatory-acknowledge (blocks navigation until ticked).
4. HR Admin sees a read/acknowledge count per announcement.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Display window evaluated near midnight | Checked against Singapore business time via a shared SGT date helper, not server UTC — an announcement set to start "today" doesn't appear hours early or late depending on where the server sits |
| Two mandatory announcements active at once | Both queue; the user must acknowledge each in turn before continuing |
| Announcement targeted at a country with no active users | Accepted and simply never shown — not treated as an error |
| End date set in the past at creation time | Refused — an announcement can't be born already expired |

---

## UC-20 — Bulk yearly entitlement update & pro-ration

**Actor:** HR Admin

**Main flow**

1. At year start, HR bulk-assigns or adjusts entitlements for every employee per their country's policy.
2. New joiners get a pro-rated entitlement from their start date — the same logic UC-24 calls automatically on account activation.
3. HR previews the computed changes before committing; nothing writes until confirmed.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Employee joined on the 1st of the month vs. the 28th | Pro-ration is by calendar day, not rounded to whole months, so the two aren't treated the same |
| Run twice in the same year by mistake | Second run is a no-op for anyone already at their statutory figure — it doesn't double-grant |
| Country policy changes between preview and commit | Preview is recomputed at commit time rather than trusting a stale snapshot |

**Why this is distinct from carry-forward (UC-04).** Both rewrite
`annual_balance`, so they have to stay conceptually separate: bulk entitlement
**resets** everyone to their country's statutory figure; carry-forward **rolls
forward** what an employee already had, capped at 5 days. Running them in the
wrong order in the same year would silently erase a carry-forward.

---

## UC-04 — Year-end auto carry-forward

**Actor:** System (scheduled sweep) · HR Admin (manual trigger)

**Main flow**

1. A daily sweep on Singapore time checks whether the year-end rollover has run yet; on 31 December it processes every employee's unused annual leave.
2. Up to 5 days carry forward into the new year; anything beyond that is forfeited and logged.
3. HR gets a summary of every carry-forward action, and can also trigger the job manually with a **preview-then-confirm** step rather than firing it blind.
4. Annual entitlement resets for the new year per country policy, feeding back into UC-20's logic.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| Employee has 8 unused days | 5 carry forward, 3 are forfeited and appear in the audit log with the amount and reason |
| Job triggered manually mid-year by mistake | The preview step shows exactly what would carry or forfeit before anything is written, so HR can back out |
| Job missed a day (server down over the New Year) | The daily sweep is idempotent — the next run catches the rollover instead of silently skipping it |
| A balance is read elsewhere right after rollover | Resolved through the active-leave-year service (below), so the staff table, HR dashboard and reports agree immediately rather than some screens showing last year's numbers |

**Design note — the active-leave-year service.** Nothing else in the app should
compute "the current year" itself. `activeLeaveYear.resolve(userId)` is the one
place that decides it, and every screen that reads a balance — the staff table,
HR dashboard, an employee's own balance, reports — calls it rather than reading
the clock directly. This exists specifically because a rollover happening
mid-request used to leave the dashboard and the staff table disagreeing with each
other for a few minutes.

---

## UC-10 — Employee records & staff import *(my half)*

**Actor:** HR Admin

UC-10 is split with Nabil: I own the employee record itself and getting people
into the system in bulk; Nabil owns leave-type and country-policy configuration
on the same admin screen.

**Main flow**

1. HR adds, edits or deactivates an employee record directly, or imports a staff list from CSV.
2. An uploaded file is parsed, previewed as a table, and only written on explicit confirm — nothing imports silently.
3. The same staff table backs both the HR admin view and the Manager's team view.

**Edge cases handled**

| Case | Behaviour |
|---|---|
| CSV row missing a required column | Flagged in the preview and excluded from the import; valid rows still go through |
| CSV re-imported with an email that already exists | Treated as an update to the existing record, not a duplicate |
| Deactivating an employee with a pending leave request | Allowed, but the request stays visible to its approver — deactivation doesn't erase history |
| Malformed CSV (wrong encoding, extra columns) | Surfaced at the preview step before any row is committed |

**Phase-4 defect worth recording.** Integration testing caught `validateToken`
silently dropping the `gender` field from the decoded session — harmless on its
own, but it meant Nabil's gender-restricted leave types (e.g. maternity) were
invisible to *every* user, not just the ones who shouldn't see them. It sat
exactly on the seam between my auth middleware and Nabil's leave-type catalogue,
and neither of us could have found it testing our own vertical in isolation.

---

## Backend & platform work with no single use case

Some of what I own doesn't map to one UC number:

- **JWT authentication, sessions, bcrypt hashing, and the RBAC middleware** that every other member's routes sit behind.
- **Deployment / CI setup and environment config.**
- **Internationalisation (i18n) resource backend** — string dictionaries with an English fallback, so an untranslated key never renders blank; each user's locale rides along with their session so the UI is correct from first paint.
- **Multi-language UI** for the account/profile screens, switching live as the language is picked (UC-23).

None of these are demoable on their own, but every other member's vertical
depends on all four being right.
