# M4 change set — blackout periods on the calendar, closed scope lists, staffing removal

This document covers everything changed on top of the M3 FINAL INTEGRATION build.

---

## 1. Blackout periods are visible in red on the employee calendar

**Before:** blackout periods existed in the database and were enforced on submit,
but an employee had no way of seeing them. The first they knew of a restricted
window was an error message after filling in the whole form.

**Now:** the Employee page loads `GET /coverage/blackouts` on mount and colours
the affected days red on the team-availability calendar.

| Mode | Cell styling | Tag |
| --- | --- | --- |
| `BLOCK` | solid red border, red fill, bold red date | `BLOCKED` |
| `SPECIAL_APPROVAL` | dashed red border, pale red fill | `APPROVAL` |

- Red styling deliberately outranks the public-holiday and weekend styling — a
  restricted day is the most important thing on that cell.
- Hovering a cell shows every window covering it: mode, reason, scope and dates.
- If a red day is also inside the currently selected range, the cell keeps a teal
  ring so the employee can still see their selection.
- Two legend entries were added under the calendar.

**Files:** `client/src/pages/Employee.jsx`

---

## 2. Employees cannot request leave on blocked dates

Enforcement is layered — the client gives fast feedback, the server is the
authority and re-checks every submission.

### Client
- A red notice appears as soon as a range is picked, naming the exact blocked
  dates and listing each window with its reason and scope.
- `canSubmit` now includes `!hasBlockedDates`, so the Submit button disables and
  reads **"Blocked dates — cannot submit"**.
- Ranges hitting only a special-approval window stay submittable; the button
  reads "Submit anyway (flag for special approval)".

### Server
- `POST /leave/apply` rejects with a message naming the specific blocked dates
  and the window's reason, rather than the old generic wording.
- `POST /leave/drafts/:id/submit` does the same, so a draft saved before a
  blackout was created cannot be submitted into it later.
- `blackoutForRange` now also returns `blockedDates` — the exact ISO dates in the
  requested range that are hard-blocked — which is what makes the precise
  messaging possible.

### Fail-open bug fixed
The blackout lookup in `leaveRequest.js` was wrapped in `try { … } catch (_) {}`
in both places. Any error in that lookup — a connection blip, a schema problem —
was silently swallowed, `blackout.hit` stayed `false`, and leave on blocked dates
was accepted. Both swallows were removed so a failure surfaces instead of
quietly disabling the restriction.

**Files:** `server/routes/leaveRequest.js`, `server/services/staffingService.js`,
`client/src/pages/Employee.jsx`

---

## 3. Country and team are closed dropdowns everywhere

**Before:** blackout scope was a single free-text box labelled "SG or team". A
typo (`"SGP"`, `"Compliance Team A "` with a trailing space) produced a blackout
row that silently matched nobody. The invite form and add-employee form had the
same problem for team.

**Now:** every one of those inputs is a dropdown fed from one source of truth.

- **`server/config/teams.js`** (new) — the canonical team list
  (`Compliance Team A`, `Compliance Team B`) plus `DEFAULT_TEAM` and
  `isValidTeam`. Model defaults and `provisioning.js` now reference it rather
  than repeating the string literal.
- **`GET /coverage/options`** (new) — returns `{ countries, teams }`. Countries
  come from the configured leave policies, i.e. exactly the set the coverage
  config manages. Readable by any authenticated user.

Dropdowns wired up in:

| Form | Country | Team |
| --- | --- | --- |
| Coverage config → blackout periods | select (policies) | select (teams) |
| HR → Invitations → invite a new employee | select (policies) | select (teams) |
| Approver → Add employee | select (already) | select (was free text) |

Changing the blackout scope between Country and Team resets `scopeId`, so a
country code can never be submitted as a team name.

### Server-side validation (the API cannot be bypassed)
- `POST /coverage/blackouts` — a `COUNTRY` scope must name a country that has a
  leave policy; a `TEAM` scope must match `TEAMS`. Otherwise 400 with the valid
  options in the message.
- `POST /invitation` and `POST /user/employees` — `team` validated with
  `yup.oneOf(TEAMS)`.
- `POST /user/register` — same.

---

## 4. New hires get the right calendar

Because the invite form's country picker is populated from configured policies,
an invited hire always lands in a country that has a public-holiday calendar and
a statutory entitlement configured. On activation they see that country's
calendar and entitlement, plus any blackout periods scoped to that country or to
their team. The invite form states this inline as the HR admin fills it in, and
the invitation list now shows the resolved country name and team.

---

## 5. Minimum staffing and the manpower heatmap were removed

Fully removed, not just hidden:

- `server/models/MinStaffing.js` — deleted
- `GET /coverage/min-staffing`, `PUT /coverage/min-staffing`, `GET /coverage/heatmap` — deleted
- `buildHeatmap`, `resolveMinHeadcount`, `MIN_STAFFING_DEFAULT` — deleted from
  `staffingService.js`, which is now blackout-only
- The "Minimum staffing & heatmap (UC-17)" card, its state and handlers — deleted
  from `client/src/pages/Admin.jsx`
- The min-staffing seed rule — deleted

**Not affected:** the AI-2 team-coverage warning on the apply form. That is
`services/coverage.js`, a separate feature, and still works.

**Note:** `sequelize.sync` does not drop tables. On an existing database the
`min_staffing` table remains, unused and unreferenced. Drop it manually if you
want it gone:

```sql
DROP TABLE IF EXISTS min_staffing;
```

---

## 6. Seed data

The min-staffing rule was replaced with a second blackout period so both
enforcement paths are demonstrable:

| Scope | Dates | Mode | Reason |
| --- | --- | --- | --- |
| Country `SG` | 2026-12-24 → 2026-12-31 | `SPECIAL_APPROVAL` | Year-end financial close |
| Team `Compliance Team A` | 2026-09-14 → 2026-09-18 | `BLOCK` | Regulatory audit week |

Both are `findOrCreate`, so re-running the seed is safe.

---

## 7. Environment files

`server/.env`, `server/.env.test` and `client/.env` are **not** in this archive —
the project README's own handoff rule is to never package them. In their place
are `.env.example`, `.env.test.example` and `client/.env.example`, which preserve
every key and comment but blank out the secret values (`DB_PWD`, `APP_SECRET`,
all API keys, SMTP credentials, Twilio credentials).

Copy them and fill in the blanks, or reuse the `.env` files from your existing
working copy.

---

## Verification performed

- `node scripts/checkSyntax.js` in `server/` — 85 files, OK
- `client/scripts/checkSyntax.cjs` — 18 files, OK
- Full-text grep for stale references to the removed features — none remain

**Not performed** (no MySQL available in the environment the changes were made
in): `npm run seed`, `npm test`, `npm run test:m3`, `npm run build`. Run these
locally before demoing.

---

## Suggested demo path

1. `hr@wypledu.online` → **Coverage config** → confirm the two seeded blackouts.
   Add a new one; note both scope pickers are dropdowns.
2. `weiling@wypledu.online` (SG, Compliance Team A) → the calendar shows
   14–18 Sep in solid red and 24–31 Dec in dashed red.
3. Select 15–17 Sep → red notice names the blocked dates, Submit is disabled.
4. Select 28–30 Dec → amber-red special-approval notice, Submit stays enabled and
   routes to the Manager as a flagged request.
5. `hr@` → **Invitations** → invite someone with country Thailand, team
   Compliance Team B. Activate via the link and confirm the Thai holiday calendar.
