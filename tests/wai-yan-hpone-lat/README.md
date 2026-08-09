# Tests — Wai Yan Hpone Lat (Member 3)

The tests in this folder are the individually attributable M3 submission suite. `m3.core.test.js` covers:

- approval-chain entry, tier progression, and executive routing;
- team/reporting-line/delegation decision authorization;
- inclusive delegation dates and team-calendar contexts;
- request-comment participants and terminal locking;
- 24-hour stage-relative reminder keys and idempotency;
- Singapore business-date behavior.

Assertions are behavior-focused and use the production pure helpers. No MySQL connection, network request, API key, or email provider is needed.

**Verified 9 August 2026:** 1 suite, 32 tests, 32 passed, 0 failed.

## Run only Wai Yan's unit tests

From `server/`:

```bash
npx jest ../tests/wai-yan-hpone-lat --runInBand
```

## Run all M3 unit tests

```bash
npm run test:unit -- --runInBand
```

## Run the real M3 API integration suite

The existing `server/tests/api.m3.integration.test.js` exercises the M3 HTTP endpoints against MySQL. Use a dedicated database whose name contains `test`:

```bash
copy .env.test.example .env.test
npm run seed:test
npm run test:m3 -- --runInBand
```

There is deliberately no test authentication bypass. Integration tests complete the real two-step login flow and must never point at the demo/production database.

The latest local attempt reached MySQL but was rejected for the configured `root` credentials in suite setup. All 35 scenarios were therefore blocked before their test bodies ran. Configure an authorized dedicated test account and rerun the commands above.

## Test quality notes

- Tests have descriptive names and one observable business outcome per assertion group.
- Boundary cases include inclusive delegation dates, exactly 24 hours, one millisecond early, wrong tier/team, self-approval, explicit reporting lines, executive requests, terminal comments, and duplicate reminder recipients.
- The Boss reminder test is a regression test for the parser compatibility gap found while organizing this submission evidence.
