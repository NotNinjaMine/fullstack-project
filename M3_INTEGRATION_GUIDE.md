# M3 Integration Guide

**Handoff status:** READY WITH LIMITATIONS  
**Scope:** M3 — UC-02, UC-08 (approver), UC-12, UC-15, UC-16, UC-28, AI-3

## 1. Feature summary

This handoff contains the M3 approval workflow, acting-approver delegation, in-app/email notification routing, 24-hour reminder logic, bulk decisions, append-only comments, approver UI, audit activity and the server-side AI-3 approval assistant.

The final submission deliberately has **no WhatsApp feature and no Twilio implementation**. Email and in-app notifications remain M3's delivery channels. Two-step verification is preserved as email-based; no replacement SMS provider was introduced.

## 2. M3-owned / M3-critical files

### Backend

- `server/routes/leaveRequest.js` — approval queue, single/bulk decision state machine, balance deduction, coverage acknowledgement, comments, approver calendar integration.
- `server/routes/notification.js` — current-user notification list/count/read/read-all and controlled reminder trigger.
- `server/routes/delegation.js` — delegation create/list/candidates/revoke.
- `server/routes/ai.js` — protected AI-3 summary endpoint.
- `server/services/delegationService.js` — tier + reporting-line authorization and comment/delegate access helpers.
- `server/services/delegationLifecycleService.js` — expiration lifecycle.
- `server/services/notificationService.js` — in-app/email routing and 24-hour reminder dedupe.
- `server/services/mailer.js`, `server/services/emailTemplates.js` — email transport/templates.
- `server/services/ai.js`, `server/services/llmClient.js` — AI advisory generation, parsing and fallback.
- `server/models/LeaveRequest.js`, `server/models/Delegation.js`, `server/models/Notification.js`, `server/models/Comment.js`, `server/models/AuditLog.js` — M3 persistence.
- `server/tests/api.m3.integration.test.js` plus M3 unit tests — backend verification suite (requires installed dependencies + MySQL test DB).

### Frontend

- `client/src/pages/Approver.jsx`
- `client/src/components/CommentThread.jsx`
- `client/src/components/DelegationPanel.jsx`
- `client/src/components/NotificationBell.jsx`
- `client/src/lib/decisionFeedback.js`
- `client/tests/*.test.js`

## 3. Files changed by this final pre-submission pass

Relative to the uploaded `leave-app-M3-server-client-conflict-fixed-codex(1).zip`:

### Modified

- `README.md` — removed obsolete SMS/Twilio setup; documented email-only 2FA delivery.
- `client/src/pages/Admin.jsx` — removed SMS delivery diagnostics UI.
- `client/src/pages/Login.jsx` — email-only 2FA wording/UI.
- `server/.env.example` — removed Twilio placeholders; placeholders only remain.
- `server/index.js` — removed Twilio startup checks.
- `server/models/User.js` — marks `SMS` 2FA enum value as legacy compatibility only.
- `server/models/TwoFactorChallenge.js` — same legacy-enum compatibility note.
- `server/routes/admin.js` — removed SMS-status endpoint; email diagnostics preserved.
- `server/routes/user.js` — email-only 2FA send/setup/status behavior.
- `server/routes/leaveRequest.js` — reporting-line-aware queue filtering, self-approval-safe shared authorization use, delegated audit attribution, safe employee serialization.
- `server/services/delegationService.js` — self-approval guard + direct-report integration helper.
- `server/services/notificationService.js` — reporting-line-aware original approver/comment/reminder routing when IDs are available.
- `server/services/twoFactorService.js` — removed SMS transport and normalized legacy preferences to email.
- `server/seed.js` — clarified demo phone fields are profile data, not a 2FA transport.
- `server/tests/delegationService.test.js` — added self-approval and direct-report authorization cases.

### Deleted

- `server/services/sms.js` — Twilio-specific SMS transport.

### Added/updated handoff documentation

- `M3_FINAL_VERIFICATION_REPORT.md`
- `M3_INTEGRATION_GUIDE.md`
- `M3_TEST_RESULTS.md`

## 4. Database integration — important

No destructive database migration was added in this pass.

The official assignment physical model specifies:

- `users.supervisor_id`
- `users.manager_id`
- and/or request-level `leave_requests.supervisor_id` / `manager_id`

This uploaded archive's Sequelize `User` and `LeaveRequest` models do not yet expose those fields. Therefore M3 currently uses a compatibility strategy:

1. `server/services/delegationService.js::assignedApproverId()` first looks for `supervisorId` / `managerId` (and snake-case equivalents) on the request or included employee.
2. If an explicit ID exists, only that assigned original approver or their valid same-tier delegate may act.
3. If the merged model has no explicit IDs, M3 falls back to the existing team scope so this branch remains runnable before M1/M5 integration.
4. `approvalEmployeeAttributes()` / `routingUserAttributes()` automatically include camel-case reporting-line fields once the merged Sequelize `User.rawAttributes` defines them.
5. The pending queue filters all candidates through `canActOn()`, so direct-report IDs immediately tighten visibility after the schema merge.

### After M1/M5 reporting-line merge

- Ensure Sequelize exposes the DB columns as `supervisorId` and `managerId` (using `field: 'supervisor_id'` / `field: 'manager_id'` if needed), **or** add request-level fields consistently.
- Seed each Employee with exactly one Supervisor and the correct Manager.
- Run the M3 integration suite and specifically verify unrelated same-team Supervisor/Manager denial.
- Do not remove the team fallback until the integrated seed/schema is known to be complete for all existing rows; otherwise legacy requests may become inaccessible.

## 5. Delegation spec note

Official UC-15 says the deputy may hold an **equal or higher role**, while also requiring delegation not to collapse the Supervisor → Manager two-tier chain.

This handoff deliberately retains **same-tier acting approvers** because it preserves the tier invariant unambiguously. Do not simply allow a Manager to act as a Supervisor deputy and then also final-approve the same request without a separate policy/data rule; that could collapse the mandatory chain. If the team wants higher-role delegation, implement and test an explicit separation-of-duties rule first.

## 6. Environment variables

Use real values only in local `server/.env`; never commit them. The handoff contains only `.env.example` placeholders.

Relevant names include:

```text
APP_PORT=
CLIENT_URL=
DB_HOST=
DB_PORT=
DB_USER=
DB_PWD=
DB_NAME=
APP_SECRET=
TOKEN_EXPIRES_IN=
APP_TIMEZONE=Asia/Singapore
TWO_FACTOR_MODE=

OPENAI_ENABLED=
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
# OPENROUTER_API_KEY may be used by the existing LLM client when configured locally.

SMTP_ENABLED=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=
```

There are **no `TWILIO_*` variables** in the final source/config.

## 7. M3 API integration points

Existing M3-relevant routes include:

```text
GET  /leave/pending
PUT  /leave/:id/decide
PUT  /leave/bulk-decide
GET  /leave/:id/comments
POST /leave/:id/comments
GET  /leave/team-calendar

GET  /notification
GET  /notification/unread-count
PUT  /notification/:id/read
PUT  /notification/read-all
POST /notification/run-reminders

POST /delegation
GET  /delegation/mine
GET  /delegation/candidates
PUT  /delegation/:id/revoke

GET  /ai/summary/:requestId
```

The shared 2FA routes remain under `/user/2fa/...` but final delivery is email-only.

## 8. Shared-file merge warnings

These files are shared with other members. If teammates have newer versions, **do not replace them blindly**:

| Shared file | Why M3 touched it | Non-M3 behavior to preserve | Merge recommendation |
|---|---|---|---|
| `server/routes/leaveRequest.js` | M3 state machine/auth/queue/comments | M2 apply/drafts/cancel/attachments; M4 coverage/calendar | Prefer cherry-picking the M3 approval/comment blocks or carefully merge whole-file diff |
| `server/models/User.js` | Legacy 2FA compatibility comment only | M1 user/auth/profile schema | Keep teammate's newer model; retain only the no-Twilio behavior as needed |
| `server/models/TwoFactorChallenge.js` | Legacy enum compatibility note only | M1 2FA persistence | Same as above |
| `server/routes/user.js` | Remove Twilio/SMS delivery while preserving 2FA | Login, recovery, profile, M1 auth | Cherry-pick email-only 2FA changes if teammate has a newer auth route |
| `server/routes/admin.js` | Remove obsolete SMS status endpoint | M5/HR admin management, email diagnostics | Keep all teammate admin routes; remove only SMS status block |
| `server/index.js` | Remove Twilio startup check | Global API mount/startup/server-client port behavior | Keep teammate's newer mounts; omit Twilio-only startup logic |
| `client/src/pages/Login.jsx` | Email-only 2FA UI | M1 login UX | Merge only 2FA delivery wording/control changes if newer |
| `client/src/pages/Admin.jsx` | Remove SMS diagnostics card | M5 admin UI | Remove only SMS diagnostics state/call/card |
| `server/services/notificationService.js` | Reporting-line notification routing | Shared email/preferences models | Merge whole M3 service if no newer version; otherwise preserve `assignedApproverId` integration |

M3-specific service/components can normally be merged as whole files if teammates did not modify them.

## 9. Teammate integration steps

1. Merge M1/M5 final `User` reporting-line schema first (or confirm its field names).
2. Merge M3 code, resolving shared files using the warnings above.
3. Confirm `server/.env` locally with MySQL, SMTP and OpenRouter values; do not copy any secret into source.
4. Run `npm ci`/`npm install` in `server/` and `client/` on a normal npm registry/network.
5. Create/update the test DB using the project's current strategy and run `npm run seed:test` if appropriate.
6. Run backend syntax + unit + M3 integration suites.
7. Run client tests, syntax check and production build.
8. Exercise the full Employee → Supervisor → Manager workflow in the browser.
9. Test reporting-line denial with **two Supervisors in the same team** and **two Managers**, proving only the assigned chain can view/act.
10. Verify final Manager approval deducts exactly once under a duplicate/concurrent request.
11. Test flagged coverage acknowledgement, delegation window/revoke/expiry, bulk rejection, comment lock and a controlled >24-hour reminder.
12. Verify email delivery and one AI-3 request with local credentials.
13. Re-scan the merged repository for secrets and unwanted messaging-provider code.

## 10. Post-merge smoke checklist

- [ ] Employee request first appears only to assigned Supervisor
- [ ] Unrelated same-team Supervisor cannot see/decide it
- [ ] Supervisor approve moves only to Manager stage
- [ ] Assigned Manager only can final-decide
- [ ] No self-approval
- [ ] Balance unchanged before final approval
- [ ] Final approval deducts once under retry/concurrency
- [ ] Flagged Manager approval requires acknowledgement
- [ ] Delegated same-tier approver works only inside active window
- [ ] Original approver retains visibility
- [ ] Bulk rejection requires reason; flagged bulk approval excluded
- [ ] Comments are append-only and terminal requests are read-only
- [ ] In-app notification count/read flows work
- [ ] Email failure does not roll back approval
- [ ] 24-hour reminder sends notification only; no status transition
- [ ] AI-3 is advisory and falls back cleanly
- [ ] Frontend build has no M3 errors
- [ ] No Twilio/WhatsApp implementation or `TWILIO_*` config exists
- [ ] No real secrets are present in the merged handoff
