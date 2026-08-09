# M3 Email Notification Completion Report

**Date:** 6 August 2026  
**Project:** Annual Leave Management System  
**Scope:** M3 approval, delegation, comments, reminders, cancellation, preferences, recipient-domain correction, and SMTP safety

## 1. Outcome

The shared email-notification implementation is complete at source/unit-test level. The project now has:

- one backend mailer for authentication and business notifications;
- independent email and in-app preferences;
- stage- and delegation-aware recipient resolution;
- post-commit, best-effort email dispatch;
- sanitized provider errors;
- event-specific templates;
- reminder deduplication;
- a safe, disabled-by-default development redirect;
- a transactional migration for stale demo staff domains;
- startup refusal when active legacy-domain recipients remain.

Live SMTP credentials already posted in chat were not reused. They must be rotated before another live verification.

## 2. Evidence-driven defect diagnosis

### Working destination

The uploaded evidence shows a Manager-review message delivered to:

```text
diana@wypledu.online
```

This demonstrates that the Manager-stage event/template and that mailbox worked during the developer’s manual run.

### Stale destination

The final-approval evidence shows the outgoing employee email addressed to:

```text
kumar@innovare.example.test
```

Gmail later returned an address-not-found bounce. The important diagnosis is that the database still contained a legacy user email. Changing seed files or frontend examples does not modify existing rows.

Both historical demo suffixes are therefore recognized by the final migration:

```text
@innovare.com
@innovare.example.test
```

Active demo staff are mapped in place to:

```text
@wypledu.online
```

## 3. Recipient-domain correction

### Source/demo data

Current demo accounts and login guidance use `@wypledu.online`.

### Existing development database

Run:

```bash
cd server
npm run migrate:demo-emails -- --confirm=wypledu.online
npm run verify:demo-emails
```

The migration:

- runs only after explicit confirmation;
- refuses test and production environments;
- updates active legacy-domain users in place;
- preserves local parts, user IDs, balances, requests, comments, and relationships;
- detects normalized duplicates;
- detects target collisions against active, invited, and deactivated accounts;
- uses a transaction and row locks;
- is safe to rerun;
- prints counts only.

`server/seed.js` also runs the same repair before `findOrCreate`, preventing a stale legacy user and a new target-domain duplicate from coexisting.

`server/index.js` verifies zero active legacy recipients before starting jobs/listening. If migration is still required, startup stops with an actionable command rather than silently sending to a bouncing address.

## 4. Shared mailer design

`server/services/mailer.js` is the common boundary for:

- password reset;
- invitation/onboarding;
- email 2FA;
- leave-submission approval alerts;
- Supervisor decision alerts;
- Manager final decision alerts;
- comments;
- delegation lifecycle events;
- cancellation;
- reminders;
- scheduled reports.

Configuration is read from backend environment variables only. The mailer:

- supports STARTTLS/587 or SSL/465 according to configuration;
- validates required fields before creating a transport;
- verifies the transport at startup when SMTP is configured;
- enforces timeouts;
- validates recipients;
- sanitizes headers;
- never logs SMTP credentials;
- categorizes authentication, timeout, connection, recipient, TLS, and generic delivery failures;
- returns structured, non-throwing results to business services.

## 5. Transaction and failure semantics

Business state is committed separately from SMTP. Notification email is an external side effect and cannot roll back:

- a submitted leave request;
- a Supervisor decision;
- a Manager final decision;
- a balance deduction;
- a comment/audit transaction;
- a delegation change;
- a cancellation;
- a reminder claim.

This prevents provider downtime from corrupting the workflow. Failures are sanitized and recorded only as safe categories/context.

## 6. Preferences and recipient deduplication

`notifyEmail` and `notifyInApp` are evaluated independently.

- Email off does not disable in-app notifications.
- In-app off does not disable email.
- The initiating user is excluded where required.
- Recipient IDs are deduplicated before dispatch.
- Original approvers and active same-tier delegates are resolved according to the current stage.
- Revoked/expired delegations are ignored.
- Comment bodies and medical/leave details are not copied into notification subject lines.

## 7. Development-only test redirect

When not every `@wypledu.online` alias is provisioned, a controlled development inbox may be used without changing production routing:

```env
EMAIL_TEST_MODE=true
EMAIL_TEST_REDIRECT_TO=controlled-inbox@example.com
```

Rules:

- disabled by default;
- ignored in production;
- configured only in backend environment files;
- preserves the intended original recipient in outgoing test metadata;
- masks the original recipient in returned status;
- does not change database user emails;
- must not be committed or enabled in `.env.example` beyond the safe `false` placeholder.

## 8. Email-event matrix

| Event | Intended recipient resolution | Source status |
|---|---|---|
| Employee submits leave | Original Supervisor(s) + active same-tier delegates | Implemented |
| Supervisor approves | Employee status update + responsible Manager(s)/delegates | Implemented |
| Supervisor rejects | Employee | Implemented |
| Manager final approves/rejects | Employee | Implemented |
| Comment added | Every other authorized chain participant, deduplicated | Implemented |
| Delegation created/revoked/expired | Affected approver(s) | Implemented |
| Pending request cancelled | Current-stage responsible approver(s)/delegates | Implemented |
| 24-hour reminder | Current-stage responsible approver(s)/delegates, once per protected claim | Implemented |
| Password reset / invitation / email 2FA | Account email | Implemented |

## 9. Automated verification actually executed

### Passed

```text
server npm run test:unit -- --runInBand
12/12 suites passed; 86/86 tests passed.
```

Relevant passing mail/domain tests cover:

- email-disabled mode;
- incomplete SMTP configuration without secret leakage;
- no real transport in `NODE_ENV=test`;
- STARTTLS transporter reuse and timeouts;
- development redirect behavior;
- production redirect refusal;
- sanitized authentication/timeout failures;
- invalid recipient rejection;
- escaped HTML templates;
- legacy-domain mapping;
- ID-preserving migration planning;
- active/inactive collision handling;
- idempotency-key validation.

### Blocked

```text
npm run migrate:demo-emails -- --confirm=wypledu.online
npm run verify:demo-emails
```

Both reached Sequelize but failed with:

```text
connect ECONNREFUSED 127.0.0.1:3306
```

No database rows were changed in this workspace.

## 10. Manual SMTP evidence

| Evidence | Status |
|---|---|
| Manager-review email to `diana@wypledu.online` | Developer screenshot shows successful receipt over TLS. |
| Final approval for REQ-74 addressed to `kumar@innovare.example.test` | Message was sent toward a stale database recipient. |
| Gmail address-not-found response | Confirms legacy recipient/domain bounce. |
| Earlier password-reset delivery to a controlled `@wypledu.online` mailbox | Confirms prior Gmail SMTP connectivity and one working destination. |

These screenshots do **not** prove every event or every staff alias. They also do not prove that the new database migration has run; the Kumar screenshot proves the opposite for that run.

## 11. Live verification still required

After rotating credentials and starting MySQL:

1. run migration and verification;
2. query active users and prove no legacy suffix remains;
3. verify SMTP transport;
4. send one uniquely identified test message;
5. execute each M3 event in the matrix;
6. confirm exact database notification counts and exact inbox deliveries;
7. confirm one final approval sends one employee email;
8. test email-disabled preference independently from in-app preference;
9. test provider failure and confirm the committed business action remains committed.

Do not include app passwords, reset links/tokens, access tokens, provider message IDs, or unredacted inbox screenshots in the submission archive.
