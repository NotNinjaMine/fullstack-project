# Testing — Jordon's Build

```bash
cd server
npm install
npx jest ../tests/jordon              # just these five suites
npx jest ../tests/jordon --verbose    # every test name
npx jest ../tests/jordon/totpService.test.js   # one suite
npx jest                              # every suite in the project
```

> On Windows PowerShell, `&&` is not a valid separator — run `cd server` on its
> own line.

**Current status: 22 tests across 5 suites, all passing** (59 assertions —
related checks are grouped into one `test()` each, so the figure Jest prints is
lower than the number of things being asserted).

```
PASS ../tests/jordon/twoFactorService.test.js
PASS ../tests/jordon/totpService.test.js
PASS ../tests/jordon/entitlementAndAccess.test.js
PASS ../tests/jordon/newFeatures.test.js
PASS ../tests/jordon/notificationService.test.js

Test Suites: 5 passed, 5 total
Tests:       22 passed, 22 total
```

---

## Testing approach

Every test here runs against **pure functions with no database** — no MySQL, no seed
data. That is deliberate: tests that need infrastructure get skipped, and skipped tests
catch nothing.

One setup step is still required, because `jest.config.js` loads
`server/tests/setupEnv.js` before *every* suite in the project and it refuses to start
without a `server/.env.test` file — the guard that stops any suite being pointed at the
demo database. Copy `server/.env.test.example` to `server/.env.test` once; these five
suites never open the connection it describes.

The trade-off is that database-backed behaviour (opening a challenge row, consuming it,
cascading a permanent delete) is not covered here. Those paths were verified separately
against a live database during development; what remains in this suite is the decision
logic, which is where the bugs actually were.

Two principles the assertions follow:

1. **Assert the behaviour, not the implementation.** `maskEmail` is tested for *"does not
   contain the middle of the address"* as well as its exact output, so a future change to
   the masking character does not fail the suite while a genuine leak would.
2. **Security functions are tested for what they must *never* do.** Several tests assert a
   negative — no plaintext in the ciphertext, no unmasked address in the API payload, no
   access for an unknown role — because those are the failures that matter.

---

## Suite 1 — `twoFactorService.test.js` (26 tests)

Two-factor verification logic (UC-25).

| Group | What it establishes |
|---|---|
| `generateCode` | Codes are always 6 digits, **including when the value starts with a zero** — a naive `Math.random()*1e6` renders `004821` as `4821`, which the user then cannot enter. Also samples 200 draws to catch a generator stuck on one value. |
| `sha256` | Storage is deterministic (so a submitted code can be matched), differs per input, and never contains the original code. |
| `maskEmail` | First and last local characters plus full domain; middle hidden; short local parts do not over-reveal; missing input degrades to `"your email"` rather than throwing. |
| `maskPhone` | Only the last four digits survive; the leading `+` is kept so an international number stays recognisable; unusable input degrades gracefully. |
| `availableMethods` | Email is always offered; SMS only with a phone number on file; the authenticator only after enrolment. Unavailable methods are still listed *with a reason*, so the UI can explain why an option is greyed out. A final test asserts the payload contains **no unmasked** address or phone. |
| Policy constants | 6-digit codes, 10-minute expiry, capped attempts and resends — the values the API docs quote. |

## Suite 2 — `totpService.test.js` (24 tests)

Authenticator app and encryption at rest (UC-25).

| Group | What it establishes |
|---|---|
| `generateSecret` | Base32 alphabet (what authenticator apps accept); 50 draws are all distinct, so two users can never share a secret. |
| `keyUri` | Correct `otpauth://totp/` scheme, secret embedded (so scanning alone completes setup), issuer and account identifiable. |
| `qrDataUrl` | Returns an inline PNG data URL the enrolment screen can render directly. |
| `verify` | Accepts the current code; rejects a wrong code, a code from a different secret, and malformed input; tolerates whitespace phones add on copy; **fails closed when no secret is stored**, so an un-enrolled account can never pass. |
| `currentCode` | Matches what a real app displays, returns null instead of throwing, and — as a regression guard — does not disturb `verify()` for other callers. |
| Encryption | Round-trips correctly; ciphertext never contains the plaintext; the same secret encrypts to **different** ciphertext each time (random IV); a tampered blob is rejected by the GCM auth tag rather than silently decrypted; a wrong `APP_SECRET` yields null; and an unreadable secret makes verification fail closed. |

### Two regression tests worth calling out

**`currentCode` does not disturb verification for other callers.** The first implementation
forced a timestamp onto the shared `otplib` singleton to read adjacent time windows. Because
that library's options setter *merges* rather than replaces, the forced timestamp leaked
into every other TOTP check in the process — including live sign-ins. The bug was found by
running the function repeatedly and then re-checking a normal verification. This test locks
that behaviour down.

**Encrypting twice gives different ciphertext.** Without a random IV, identical secrets
produce identical ciphertext, so anyone with database access could tell which users share a
secret, or spot a secret being reused after a reset.

## Suite 3 — `entitlementAndAccess.test.js` (25 tests)

Entitlement maths, the Singapore business day, delivery routing, and RBAC.

| Group | What it establishes |
|---|---|
| `prorateEntitlement` (UC-20) | January start = full entitlement; mid-year ≈ half; December is small but non-zero. Bounded at both ends (never above the full figure, never negative), scales with the country entitlement, rounds to half-days, and is **monotonic** — a later start never yields more than an earlier one. |
| `todaySGT` (UC-26) | Returns `YYYY-MM-DD` matching the DATE columns it is compared against; equals the real Singapore date; is never behind UTC and never more than one day ahead. |
| `isDemoAddress` | Recognises seeded demo accounts, treats outside addresses as real, is case-insensitive, and — importantly — does **not** match lookalike domains such as `notinnovare.com` or `innovare.com.attacker.net`, which a naive substring check would. |
| `requireRole` (UC-25) | Permits listed roles, rejects unlisted ones with `403`, rejects unauthenticated requests, rejects unrecognised roles, and treats an empty allow-list as "nobody". |

### The timezone regression test

`todaySGT` is never behind UTC guards a bug that reached the running app: the announcement
display window used `new Date().toISOString()`, which is always UTC. On a UTC server — the
hosting default — that made an announcement starting "today" invisible for the **first eight
hours of every Singapore day**, with no error anywhere to explain why. The same pattern was
present in the delegation date check and was corrected at the same time.

## Suites 4 & 5 — retained

`newFeatures.test.js` (working-day calculation, entitlement pro-ration) and
`notificationService.test.js` cover shared services this build depends on. They were kept
from the full project and still pass unchanged.

---

## What is not covered

Stated plainly so the gaps are visible rather than assumed:

- **Database-backed 2FA flow** — creating, consuming and expiring a challenge row. Verified
  manually against MySQL; not automated here because it needs a live database.
- **HTTP-level route tests.** During development these caught two real bugs that unit tests
  could not: `/user/2fa/send` rejected `AUTHENTICATOR` at the validation layer, and the
  `TwoFactorChallenge.method` ENUM was missing the same value — so the authenticator option
  was unreachable even though every unit test passed. Both are fixed, but the lesson stands:
  **unit tests over pure functions cannot see a wiring failure.** Adding a Supertest suite
  against an in-memory database is the highest-value next step.
- **Frontend components.** No React test setup in this build; the UI was verified manually
  and by a production build that must compile cleanly.
- **Email and SMS delivery.** Not exercised against real providers; demo mode is covered via
  `isDemoAddress`.
