# AI Log — Final Debugging & Balance Isolation

**Date:** 9 August 2026  
**Tool:** Codex in the project working directory  
**Member:** Jervis (M2 — Employee Leave Experience)  
**Outcome:** two UI defects and one active-year data-isolation defect diagnosed and fixed; automated verification passed.

## 1. Return early dialog could not be closed

**Prompt:** *"I cannot exit from this return early message."* A screenshot showed
an empty `Return early` dialog with only its close icon.

**What the AI did:** inspected the employee page and the shared `Modal` component.
The `Modal` component does not use an `open` prop; callers must render it
conditionally. The Return early code always rendered the modal and only placed
the body behind `shortenTarget &&`.

**Root cause:** clicking the close icon cleared `shortenTarget`, but the empty
modal shell immediately rendered again.

**Decision:** render the whole modal only while `shortenTarget` exists. This keeps
the shared modal contract consistent with the other dialogs.

## 2. HR request number input was confusing

**Prompt:** *"In HR when I try to enter the request number it doesn't work."*

**What the AI did:** traced the HR correction form and the
`PUT /leave/:id/hr-adjust` route. The input silently removed every character
except digits, even though the interface displays requests as `REQ-128`.

**Decision:** allow the HR user to type `128`, `REQ-128`, or `#128`, then normalize
the value immediately before the API call. The API now also returns a readable
404 message when the request number does not exist.

## 3. Every employee appeared to have zero leave

**Prompt:** *"How come all my annual leaves and sick leaves are all 0? I thought
each person should have their own dedicated amount."*

**What the AI did:** inspected the balance model, provisioning service, seed data,
and `/leave/balances` endpoint, then queried the existing database read-only.
Balances are correctly keyed by `userId`; they are not shared. The database had
normal 2026 balances for the employees, but one incomplete 2027 balance existed
for Diana.

**Root cause:** `currentLeaveYear()` selected the highest year found in any single
balance row. That one 2027 row made the endpoint request 2027 balances for every
employee. Since the other employees had only 2026 rows, the frontend's missing
balance fallback displayed zero.

**Decision:** keep each balance tied to its employee and change active-year
selection. A future year becomes globally active only when that year has balance
records covering the full user population, which is how the year-end carry-forward
operation is designed to behave. A partial future-year record no longer hides
valid current-year balances.

**Live verification:** the active year resolved to 2026 and employee 1 returned:

| Balance | Entitled | Carried | Used | Remaining |
|---|---:|---:|---:|---:|
| Annual | 14 | 5 | 10.5 | 8.5 |
| Sick with MC | 12 | 0 | 0 | 12 |
| Sick without MC | 2 | 0 | 0 | 2 |

No balance records were deleted or merged between employees.

## 4. Verification and judgement

The final checks passed:

- server syntax check: 96 JavaScript files passed;
- server tests: 18 suites and 242 tests passed;
- earlier client syntax, client build, and client tests also passed;
- local client and API smoke endpoints responded successfully.

The in-app browser connection timed out during the final turn, so the final UI
verification was supported by source inspection, live database/API checks, and
the automated suite rather than being described as a completed browser click
test. This limitation is recorded instead of being hidden.

## 5. Git decision

The local repository had three earlier commits and no configured remote. The
GitHub URL supplied in the prompt was not added as a remote and no push was
performed. The new fixes and this log are committed locally with a descriptive
message so the contribution remains traceable.
