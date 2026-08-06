# AI Reflection — Jordon

Leave Management System · Platform, Identity & Self-Service vertical.

**Scope note.** The system ships five AI *product* features (AI-1 natural-language leave
entry, AI-2 coverage analyzer, AI-3 approval assistant, AI-4 HR chatbot, AI-5 anomaly
flags). None of them belong to Member 1 — this vertical is identity, access and
self-service, which is deliberately deterministic. So this reflection is about **AI as a
development tool**: where an AI coding assistant added real value while building the
vertical, where its output had to be modified, and what that changed about how the work was
approached.

---

## 1. Where AI added genuine value

### Unfamiliar libraries, quickly

The largest single win. Two-factor verification meant working with TOTP (RFC 6238) and
`otplib` for the first time, and the Excel import meant SheetJS. Reading both from scratch
would have cost most of a day each. With AI assistance a working enrolment flow — secret
generation, `otpauth://` URI, QR data URL, verification — existed within an hour, and the
same for converting an uploaded `.xlsx` first sheet into the CSV the existing import
endpoint already accepted.

The value was not "it wrote the code". It was **compressing the unknown-unknowns**: I did
not know that authenticator apps expect base32, that a `±1` time-step window is standard for
clock drift, or that SheetJS can go straight from a workbook to CSV. Those are things you
either already know or spend hours discovering.

### Repetitive structure

Once the shape of an endpoint was settled — yup validation, role guard, try/catch, audit
log — every subsequent endpoint was mostly the same shape with different fields. Invitation
resend/cancel, the account actions, the announcement CRUD: AI generated these fast and
consistently, which is exactly where hand-writing is both slow and error-prone.

### Documentation and translations

The API documentation, this schema reference, and the seven-language dictionaries for the
multi-language UI were all AI-drafted. Documentation in particular is work that is easy to
skip under deadline; having a complete first draft made it far more likely to actually
exist.

### Tests I would not have thought to write

Asked for tests, AI proposed cases I had not considered — a verification code with a leading
zero, a lookalike domain like `innovare.com.attacker.net`, encrypting the same secret twice
and asserting the ciphertext differs. The leading-zero case is a real bug class: a naive
`Math.random() * 1e6` renders `004821` as `4821`, which the user then cannot type in.

---

## 2. Where AI output had to be modified

This is the more useful half of the reflection. Every item below is a real defect in
AI-generated code for this vertical, caught before or during testing.

### 2.1 Code that looked finished but was unreachable

The authenticator-app option was implemented, reviewed, and appeared complete. Its service
logic was correct and unit-tested. It was also **completely unusable**, for two reasons:

- `POST /user/2fa/send` validated `method` against `oneOf(["EMAIL", "SMS"])` — the new value
  was rejected before reaching any of the working code.
- The `TwoFactorChallenge.method` column was `ENUM("EMAIL", "SMS")`, so saving the choice
  would have thrown on MySQL.

Both were places the new feature had to be *added to an existing list*, and both were missed
because the generated code was locally correct. Unit tests over the service passed happily.
The bugs only surfaced when the flow was exercised over real HTTP.

**What changed:** I stopped trusting "the function works" as evidence that "the feature
works", and started testing new paths end-to-end through the actual endpoints.

### 2.2 A plausible idiom that was wrong for the business context

Announcements silently failed to appear when published. The cause:

```js
const todayISO = () => new Date().toISOString().slice(0, 10);
```

This is the standard way to get a `YYYY-MM-DD` string and appears throughout tutorials.
`toISOString()` is always **UTC**. The company's business day is Singapore time (UTC+8), and
the server clock is UTC — so for the first eight hours of every Singapore day, the server
believed it was still yesterday, and an announcement starting "today" failed its own
`startDate <= today` check. No error was logged. It simply did not appear.

The same idiom had been copied into the delegation date check, so the same bug existed twice.

**What changed:** this is the clearest example of AI producing code that is *correct in
general and wrong here*. Anything involving dates, currency or locale now gets checked
against the project's actual context rather than accepted as idiomatic.

### 2.3 A subtle bug in the AI's own fix

While implementing a variant of TOTP verification, the generated approach set a forced
timestamp on the shared `otplib` singleton to check adjacent time windows, then restored it
afterwards. That looks safe. It is not: that library's options setter **merges** rather than
replaces, so the forced timestamp could not be cleared and leaked into every other TOTP
check in the process — including live sign-ins.

Found by calling the function forty times and then re-running a normal verification. The fix
was to build an isolated instance via `authenticator.create()` instead of touching the shared
one. There is now a regression test for it.

**What changed:** I became much more suspicious of "save state, mutate, restore" patterns,
and of shared singletons generally.

### 2.4 Doing what was asked instead of what was needed

Asked to let Supervisors and Managers apply for their own leave, AI implemented exactly
that. What it did not do — until the flow was tested — was point out that the approval
engine had no check preventing someone from approving **their own** request. A Supervisor
could have filed leave and approved it themselves.

The fix needed a real design decision, not a patch: a Supervisor's own leave routes to their
Manager; a Manager's or HR Admin's own leave routes to HR Admin, who has no same-tier peer
conflict. Self-exclusion is now enforced in the authorisation layer, both pending queues,
single decide and bulk decide.

**What changed:** AI answers the question asked. It does not reliably ask *"should this be
allowed at all?"* — that judgement stayed with me.

### 2.5 Two features that silently did the same thing

"Run year-end carry-forward" and "Apply bulk entitlement" produced identical numbers,
because both computed the new entitlement as the country's statutory minimum. Worse,
carry-forward was therefore *erasing* above-statutory entitlements every year — a manager on
21 days would silently drop to 14.

Each function was individually reasonable. The defect only existed in the relationship
between them, which is precisely what a generated function cannot see.

### 2.6 A refactor that broke a caller

Making the provisioning year configurable, AI changed the parameter default to `null` and
added a resolved `activeYear` variable — but left three `LeaveBalance.create()` calls still
using the raw parameter. Every newly created employee, including CSV/Excel imports, would
have been given balances for year `null`. Caught by an integration test on the next run.

---

## 3. What this changed about how I work

**Tests moved from afterthought to the primary check on AI output.** Reviewing generated
code by reading it is weak — it usually *looks* right, which is exactly the failure mode.
Running it is what found §2.1, §2.3 and §2.6.

**HTTP-level tests earn their cost.** Unit tests over pure functions were green while the
authenticator feature was entirely unreachable. Testing through the real endpoints found in
minutes what unit tests structurally could not see. This is recorded as the highest-value
next step in `testing.md`.

**Context beats idiom.** Section 2.2 is the lesson in miniature: the most dangerous
AI output is not obviously-broken code, it is textbook-correct code applied to a situation
where the textbook does not hold.

**Cross-cutting reasoning stayed manual.** Every defect that involved *relationships* —
carry-forward vs bulk entitlement, self-approval, the year-sync problem where five screens
each computed "current year" independently — needed someone holding the whole system in
mind. AI is strong within a file and weak across a system.

---

## 4. Honest assessment

AI assistance was worth it. Realistically it saved several days on this vertical, most of
that in the TOTP and Excel work where the alternative was reading specifications.

But the productivity gain is not uniform, and it is easy to overstate. It was largest for
**bounded, well-specified, conventional** work — a CRUD endpoint, a translation dictionary,
a QR code. It shrank sharply for anything requiring judgement about **this system's** rules,
and it went slightly *negative* in the cases above, where plausible-looking code cost more
time to debug than writing it carefully would have.

The distinction that matters: AI was reliable at *"how do I do X"* and unreliable at
*"should X be allowed, and what else does X touch"*. The security-sensitive parts of this
vertical — who may approve whose leave, what a lockout does, whether a secret can be read
back — are exactly the second kind. Those needed to be reasoned through and then verified by
execution, and treating AI output there as finished would have shipped real vulnerabilities:
the self-approval hole in §2.4 is a genuine one that reached working code.

The workflow I would recommend, and would use again: **let AI draft, then assume the draft
is wrong until something executes and proves otherwise** — and reserve human attention for
the questions AI does not know to ask.
