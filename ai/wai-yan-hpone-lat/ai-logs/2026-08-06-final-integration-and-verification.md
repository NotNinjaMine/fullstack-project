# AI Log — M3 Final Integration and Verification

**Date:** 6 August 2026  
**Student:** Wai Yan Hpone Lat  
**Phase:** integrated repository audit, regression fixes, and evidence classification

## Prompt 1

> Inspect the integrated team repository, not an isolated M3 copy. Verify every M3 route, model, service, page, and test against the assignment guide. Preserve non-M3 behavior and report blocked checks honestly.

### Output summary

The assistant traced the integrated state machine, balance transaction, delegation, notification, reminder, comments, team schedule, AI-3, 2FA handoff, and frontend feedback. It separated executable unit checks from MySQL, SMTP, hosted-AI, and browser checks.

### My decision

I used evidence categories instead of claiming that static inspection proved runtime behavior:

- fixed and executed;
- implemented and statically inspected;
- blocked by the environment;
- manual evidence supplied separately.

## Prompt 2

> Diagnose the duplicate final-approval toast and rapid duplicate submission without removing persistent notifications.

### Output summary

The assistant found duplicate temporary-feedback paths and a same-frame double-click gap. It proposed one decision-toast publisher, a synchronous single-flight guard, and a backend idempotency key.

### Decisions and changes

- Kept persistent employee notifications; they are not the same as an approver toast.
- Centralized the temporary result toast with a stable request-based ID.
- Added a frontend lock and a server `Idempotency-Key`/`submissionKey` safeguard.
- Used a composite unique index so retries return the original request without repeating side effects.

## Prompt 3

> Investigate stale demo email recipients without changing user IDs or breaking relationships. Do not expose credentials and do not run a destructive migration automatically.

### Output summary

The assistant distinguished successful SMTP submission from a later recipient bounce and produced a guarded migration/verification approach.

### Decisions and changes

- Preserved IDs and relationships by updating recognized legacy domains in place.
- Added collision detection, transaction locking, environment guards, confirmation, and safe reruns.
- Kept real SMTP credentials in environment files only.
- Did not reuse credentials that had been exposed in earlier chat.

## Commands and results recorded

```text
server npm run check                 PASS (85 JavaScript files)
server npm run test:unit             PASS (12 suites, 86 tests)
client npm test                      PASS (5 tests)
client npm run check                 PASS (18 JavaScript/JSX files)
server npm run seed:test             BLOCKED: no MySQL on 127.0.0.1:3306
server npm run test:m3               BLOCKED in beforeAll for the same reason
client npm run build                 BLOCKED by missing platform Rollup package
```

These historical results belong to that environment and date. Current submission verification is recorded separately; they are not silently presented as a fresh run.

## Final judgment

AI was useful for exhaustive tracing and mechanical fixes, but the important choices were policy choices: no automatic approval, no self-approval, no notification rollback of decisions, no hidden test bypass, no destructive email rewrite, and no false claim that a blocked integration test passed.
