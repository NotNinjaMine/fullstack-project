# AI Log — Integration & Extensions phase

**Date:** 8–9 August 2026
**Tool:** Claude Code (Opus 5) in the project working directory
**Member:** Jervis (M2 — Employee Leave Experience)
**Outcome:** five-way merge completed; 5 defects found and fixed; 3 features added;
server suite 194 → 227 tests, all passing.

---

## 1. Code review of my own vertical

**Prompt:** *"tell me what other improvements can be made, im member 2"*

**What the AI did:** read `leaveRules.js`, `leaveRequest.js`, `swap.js`,
`icsService.js`, the AI-1 route and my Tier-2 notes before answering — it did not
answer from the file names alone.

**Output:** a ranked list of ~15 issues. The ones I judged real:

- Two different definitions of "the current leave year" — the balance page uses the
  active leave year, apply/approve read the year off the dates. They disagree after
  a year-end rollover.
- Leave spanning 31 December is charged entirely to the starting year.
- Balance updates were unguarded read-modify-write — two approvals at the same
  instant lose one.
- The forecast panel and the apply form disagreed about complementary half-days:
  the forecast warned "you already have leave", then the form accepted it.
- A swap could create a double booking, because the paired update never re-ran the
  overlap check.
- The MC file type was whatever the browser claimed — a renamed `.exe` passed.
- `attachmentData` was being returned in every list endpoint, so every dashboard
  load downloaded every certificate.

**My decision:** accepted the list as a backlog. Deferred all of it at this point —
integration was the blocker and there was no value in fixing my own vertical while
the other four had not landed. Items 4 and 8 were later fixed as a side effect of
the merge (Member 3's transactional rewrite of the decision path fixed the
concurrency issue better than my planned fix would have).

**Judgement applied:** I did not act on the whole list. Several suggestions
(rate-limiting AI-1, an `.ics` subscription feed, splitting my 1,900-line Employee
page) are genuinely good but out of scope for a submission deadline, and I would
rather have a smaller working system than a larger half-finished one.

---

## 2. The five-way merge

**Prompt:** *"integrate my other members parts into the current file i doing right
now, check for any errors and also do test runs to see if all works well"* —
attached Nabil's final zip and the M4 coverage/blackout zip.

**What the AI did — and the key decision of the whole session.** It did *not*
start copying files. It hashed every source file in both zips against my working
copy, discovered that neither zip was a superset of my work, and then searched
backwards through the older zips in my Downloads folder to find the common
ancestor. It established this history:

```
leave-app-complete_11.zip (28 Jul)  ← shared ancestor
├── my working copy            (M1 + M2)
└── leave-app-M3-FINAL         (M3)
    ├── Nabil's zip            (M5)
    └── M4 coverage/blackout   (M4)
```

**Why that mattered:** both zips were missing every M2 file — `leaveRules.js`,
`icsService.js`, `StatusStepper.jsx`, all my tests. A copy-over in either
direction would have silently destroyed one member's work. The AI built a
temporary git repository with each member's tree as a branch and performed a real
three-way merge.

**Result:** 25 conflicts. The substantive resolutions:

| Conflict | Decision | Reasoning |
|---|---|---|
| `decideOne()` | Took M3's transactional rewrite, re-inserted my UC-03 cancellation logic *inside* their transaction | Their version fixed the balance race I had flagged in step 1 — better than mine |
| `prepareSubmission()` | Kept mine, rejected M3's | M3's copy had re-duplicated the validation my round deliberately unified; a draft could bypass a rule again |
| 2FA service | Kept M1's three-method version over M3's email-only | M1 owns UC-25 and had shipped the fuller feature; M3's handoff predated it |
| `delegationService` | Took M3's newer structure, re-added M1's leadership-routing rule | Neither alone was correct |
| `MinStaffing` model | Accepted M4's deletion | Verified nothing referenced it any more |
| `sms.js` | Kept, against M3's deletion | Still required by M1's 2FA service |

**My decision:** accepted all resolutions after reading the reasoning for each.
The one I checked hardest was the 2FA one, because it discards a teammate's
deliberate change — I confirmed M1's version was the later work before agreeing.

---

## 3. Defects the merge exposed

The AI ran the test suite rather than declaring success. **181 of 194 passed.**

### 3.1 — `services/ai.js` bypassed M3's `llmClient`

My AI-1 parser had its own provider code; M3 had since built a hardened client
with timeouts, response sanitising and safe error codes, plus tests asserting
`ai.js` used it. Fix: delegate text calls to `llmClient`, keep my own path only
for the vision call the MC checker needs (`llmClient` has no image support).

### 3.2 — the gender bug *(the most valuable find of the session)*

Live smoke tests showed maternity and NS/reservist leave missing for everyone.
Root cause: `validateToken` rebuilds `req.user` from the live database row but
**omitted `gender`**, so M5's gender-restricted leave types were invisible to all
users and would have been rejected on apply.

**Why nobody caught it:** Member 1 wrote the middleware, Member 5 wrote the
feature that depends on it. Neither member's copy contained both halves. It could
only appear after integration.

**My decision:** fixed it in M1's file — a one-line addition — and documented it in
my schema notes so Member 1 knows. This is the single best argument in the project
for integration testing.

### 3.3 — my own test fixtures were fragile

Two M2 tests failed for reasons unrelated to the code: one used "tomorrow", which
happened to be National Day observed; another picked dates inside M4's newly
seeded blackout window. Fix: fixtures now ask M4's calculation service for real
working days and steer around blackout periods.

**My decision:** this was my bug, not the merge's. A test that fails because of
the calendar is worse than no test, because it trains you to ignore red.

**Result:** 194/194 passing, including M3's integration suite which had been
failing at `401` before the merge.

---

## 4. The dead "Save as draft" button — and an AI mistake worth recording

**Prompt:** *"there are alot of errors like i cant save draft"* (with a screenshot)

**What the AI did:** reproduced it through the API first — the whole draft
lifecycle worked perfectly. So it opened the running app in a browser, signed in
through the real 2FA flow, filled the form, clicked the button, and captured that
**no network request was made at all.**

**Root cause:** the merged handler referenced `editingDraftId`, a variable that
only existed in Nabil's version of the page. Referencing an undeclared variable
throws immediately, the `catch` swallowed it, and the user saw a generic "Could
not save draft".

### The AI got this wrong first

Earlier in the session it had run a check and told me every identifier was
defined. That check used a loose text match which counted the line
`const req = editingDraftId` as a *definition* — so it passed when it should have
failed. It flagged this itself when the bug surfaced.

**What we did about it:** rather than fix the one variable and move on, it wrote
a proper scope-aware checker using the Babel parser that Vite already ships (no
new dependency), and that found **four more** of the same class:

| Where | Broken |
|---|---|
| Admin → Policies | "Add leave type" crashed the tab (`BLANK_NEW_TYPE`) |
| Admin → Invitations | Crashed on load (`setOptions`, `options`) |
| Employee → Edit draft | Leave-type dropdown crashed (`LEAVE_TYPES` vs `leaveTypes`) |

**Why the build did not catch these:** an undefined identifier is only an error
when the line executes. Vite compiled all of it happily. They present as dead
buttons, not build failures.

**My decision:** kept the checker as `npm run check:undefined` and it now runs as
part of my verification routine. **This is the most transferable thing I got out
of the session** — not the fix, but the realisation that a green build proves
nothing about code paths that never ran, and that after a multi-way merge you need
a tool that reasons about scope.

---

## 5. Building the UC-03 / UC-13 extensions

**Prompt (paraphrased):** my part looked employee-only next to teammates who each
had HR or approver screens; the lecturer wanted more backend.

**What the AI did:** pushed back on the premise with evidence — it showed that my
swap approval queue already runs entirely on the Supervisor and Manager screens
(`/swap/pending`, `/swap/:id/decide`), that my cancellation flag changes how
approvers see the queue, and that HR views certificates through my endpoint and my
access rule. It then pointed out a genuine hole: `PUT /leave/:id/cancel` tells
employees to "ask HR to adjust it instead", **and no such HR screen existed.**

**Design decision I made:** it offered three separate features. It also noted that
two of them — partial cancellation and HR adjustment — are the *same operation*
("shorten a leave, return the difference") differing only in who may act and when.
I chose to build all three, with those two sharing one engine rather than being
written twice.

| Door | Who | When |
|---|---|---|
| `PUT /leave/:id/shorten` | Employee (owner) | Only before the leave starts → two-tier approval |
| `PUT /leave/:id/hr-adjust` | HR only | Including leave already under way → immediate, audited |

**Modelling decision:** rather than a new change-request table, an early return is
one nullable column (`pendingEndDate`) on the existing row. `cancellationRequested`
alone means "withdraw everything"; with a date it means "end it here". That reuses
the entire existing approval path instead of creating a second one to keep in step.

**Where I had to correct the AI:** its first test fixtures ran out of leave balance
and rolled into a year with no balance row, then collided with an existing test's
dates. It took three iterations. It also asserted a balance restore in a test where
the fixture had never deducted anything, so the assertion was wrong rather than the
code. I made it fix the fixtures properly — provision the next year's balance,
spread the dates out, and make a failed fixture print *why* — rather than loosen
the assertions to make them pass, which was the tempting shortcut.

**Result:** 33 new tests (24 unit, 9 integration). Suite 194 → 227.

**Verified in the browser, not just asserted:** signed in, clicked Return early on
a 5-day leave, watched it compute 3 days returning, approved it as Supervisor then
Manager, and confirmed the leave stayed `APPROVED` with the end date moved and
exactly 3 of 5 days back. The MC compliance list immediately surfaced a real gap in
the seeded data.

---

## 6. Submission documentation

**Prompt:** the pre-submission checklist.

**What the AI refused to do, and I agree with:** it would not fabricate AI logs for
project phases it did not observe, and it flagged that the git history cannot
honestly be back-dated to look like regular individual commits when the repository
was only initialised at the end.

**What it did instead:** generated the API documentation from the actual route
definitions, the schema documentation from the live database via
`describeTable()`, and ran a credential scan before the first commit — its first
scan was too broad and flagged `DB_HOST=localhost` as a leak, so it narrowed to
genuinely sensitive keys and confirmed none of my six real secrets appear in any
of the 166 tracked files.

---

## Summary of AI contribution

| Where it was decisive | Where I had to override or correct it |
|---|---|
| Spotting that neither zip was a superset, and reconstructing the branch history | A loose identifier check that gave a false pass |
| Merging 25 conflicts with a stated reason for each | Test fixtures that were wrong three times |
| Finding the `gender` bug no single member could have found | An assertion written against a fixture that never deducted |
| Writing a scope-aware checker that found 4 more dead buttons | A regex that missed "blackout" while searching for "block" |
| Noticing that two proposed features were one engine | Its initial improvement list was longer than was sensible to act on |
