# AI Log — Porting M2 features onto the approvalChain build

**Date:** 10 August 2026
**Tool:** Claude Code (Opus 5)
**Member:** Jervis (M2)
**Outcome:** three M2 features ported onto a teammate's refactor without either side
losing work. 242 tests across 18 suites passing.

---

## What I asked

> *"we are now using this folder, integrate my new parts (1. HR adjust, 2. MC
> compliance list, 3. Partial cancellation) into this new one"* — pointing at a
> fresh team archive, `leave-app-complete_14`.

## What the AI did before touching anything

It did **not** start copying my files in. It first established what the new folder
actually was, by hashing every source file against my working copy:

- The new archive **already contained** my earlier work, including this session's
  `gender` fix, the five undefined-identifier fixes, and the `llmClient` wiring —
  so it was downstream of my previous merge, not a stale branch.
- It **did not** contain my three newest features.
- It **did** contain something I had never seen: `server/services/approvalChain.js`,
  plus a test suite for it, referenced by ten other files.

Reading that module changed the whole job. A teammate had centralised the approval
hierarchy and, in doing so, introduced:

- a fifth role, **BOSS**
- a new pending stage, **`PENDING_BOSS`**
- a rule that **HR Admin no longer has a special path** — HR now applies like an employee
- executive routing: a Manager's own leave goes up to the Boss; the Boss's own leave
  goes back down to *any* Manager, company-wide

**My decision:** copying my versions of `leaveRequest.js`, `Employee.jsx` and
`Admin.jsx` over the new ones would have silently deleted that refactor. So the
features had to be *ported into* the new code, not pasted over it.

## What actually changed in the port

| My original code | What it had to become |
|---|---|
| `status = role === "EMPLOYEE" ? "PENDING_SUPERVISOR" : "PENDING_MANAGER"` | `chain.initialStatusFor(role)` — so a Manager's early return goes to the Boss |
| `if (actor.role === "SUPERVISOR") { … } else { /* final */ }` | `chain.isFinalStage()` / `chain.nextStatusAfterApproval()` |
| Audit text hard-coded to "Manager" | `actor.role === "BOSS" ? "Boss" : "Manager"` |
| MC compliance scanned `["PENDING_SUPERVISOR","PENDING_MANAGER","APPROVED"]` | `[...chain.PENDING_STATUSES, "APPROVED"]` — otherwise a Manager's sick leave sitting at `PENDING_BOSS` would never be chased |
| Admin tab appended before `EmailDeliveryCard` | That function no longer exists; the leadership-approvals tab had also been removed (HR lost its special path), so the tab is appended at the end and re-imports its icon |

The pure functions — `shortenCheck`, `shortenOutcome`, `mcComplianceGap` — ported
**unchanged**, because they take plain values and know nothing about the chain.
That is the payoff for having kept them free of database and request objects.

## Where I had to correct the AI

**It reported an enormous client diff at first** — 4,479 changed lines in
`Employee.jsx` — which would have implied the teammate had rewritten the page. That
was wrong: it was a CRLF/LF line-ending artefact. Re-measured with
`--strip-trailing-cr`, the real difference was **151 lines**. Had I accepted the
first number I would have wasted the session reconciling a file that had barely
changed. Worth remembering: on Windows, a diff that claims *everything* changed
usually means line endings, not content.

**It also left my documentation claiming "four roles".** After the port it had to
go back through `docs/architecture.md`, my API, schema and use-case documents and
the test README to correct the role count, the `PENDING_BOSS` stage, the endpoint
count (127 → 130), the service count (32 → 33) and the test totals (227 → 242), and
re-render the architecture diagram. Documentation that describes a build is only
worth having if it is re-checked whenever the build moves.

## The evidence the port was correct

All 33 of my feature tests passed against the new chain **without modification**.
That is the useful signal: they assert behaviour (*"only the difference in days
comes back"*, *"the employee is turned away once the leave has started"*) rather
than implementation, so a change to who approves what did not break them. The
teammate's own 15 `approvalChain` tests also still pass, which is the evidence I
did not damage their work.

**Final: 242 tests / 18 suites passing, client builds clean, no undefined
identifiers, 132 routes mounted.**

## Reflection point for the report

This is the second time in this project that the hard part was not writing code but
working out *what the code I was given actually was*. Both times the winning move
was the same: measure before editing. And both times the thing that made my code
portable was that its rules are pure functions — I could drop them into a codebase
with a different approval hierarchy and they simply worked.
