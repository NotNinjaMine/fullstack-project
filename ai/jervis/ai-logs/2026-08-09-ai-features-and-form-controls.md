# AI Log — AI Features & Form Controls phase

**Date:** 9 August 2026  
**Tool:** Codex (GPT-5) in the project working directory  
**Member:** Jervis (M2 — Employee Leave Experience)  
**Outcome:** AI-1 extended to handle multiple leave periods and multilingual input; an opt-in MC image check added; country and team fields replaced with policy-backed dropdowns; startup schema-index failure repaired; 114 server tests passing.

---

## 1. Improving AI-1 natural-language leave parsing

**Prompt:** *"do the 1 2 and 4 one"* — referring to multi-request parsing, multilingual input, and an MC document check.

**What the AI did:** inspected the existing `services/ai.js`, `routes/ai.js`, Employee page and the live OpenRouter configuration before changing anything. It confirmed the hosted model was active (`openrouter`, `openai/gpt-4o-mini`) rather than assuming the app was using the offline parser.

### 1.1 — Multiple leave periods in one sentence

**Problem found:** AI-1 only had room for one leave request. The HLD's own example — *"I need next Monday off, then a half day on the following Friday"* — silently lost the Monday request.

**Implementation:**

- Changed the AI response from one parsed object to a `requests[]` list while retaining the original single-request fields for backward compatibility.
- Updated the LLM prompt to require one item per distinct leave period.
- Added an offline splitter so the feature still has a usable fallback when the hosted model is unavailable.
- Updated the Employee UI to show each parsed period separately, with **Use in form** and **Save all as drafts** options. Nothing is auto-submitted.

**Important correction during testing:** the hosted model initially returned a Saturday for "next Monday". Rather than trusting the model, the implementation now includes today's weekday plus the next seven calendar dates in the prompt. It also checks every returned date against the employee's country working-day and public-holiday calendar.

**Result:** a compound request is displayed as separate periods. A date which lands on a weekend or Singapore public holiday is shown with a warning instead of being silently accepted.

**Judgement applied:** the AI remains advisory. It fills or creates drafts only; balance, overlap, policy, blackout and coverage rules still run in the normal leave submission route.

---

## 2. Multilingual employee input

**Prompt:** same request as above.

**What the AI did:** extended the AI-1 instruction to accept an employee's input in any language, detect the input language, and return the leave reason in English for the supervisor.

**Live checks performed:**

| Input language | Test result |
|---|---|
| Chinese | Annual leave parsed; language returned as `zh` |
| Malay | Annual leave on 25 August; reason returned as "Family event"; language `ms` |
| Vietnamese | Fever plus doctor's note parsed as sick leave with MC; language `vi` |
| Thai | Tomorrow afternoon parsed as a PM half-day; language `th` |

**Result:** the Employee UI shows the detected language in the parsed-result chip. The resulting leave form remains in English, which keeps the approval view consistent for supervisors and managers.

**Judgement applied:** multilingual parsing depends on the hosted LLM. If it is unavailable, the app falls back to the existing English heuristic parser instead of failing the leave form.

---

## 3. MC document check — opt-in image review

**Prompt:** same request as above.

**What the AI did:** added an employee-only `POST /ai/check-mc` endpoint and a **Check MC with AI** button on a leave request carrying an image certificate.

**Behaviour:**

1. The employee submits or drafts sick leave with an image MC.
2. The employee chooses to run the check; it is never automatic.
3. The AI reads the clinic name and MC coverage dates from a JPG, PNG or WebP image.
4. The app compares those dates with the leave request and gives one of three advisory results:
   - **MATCH** — MC dates cover the leave dates.
   - **MISMATCH** — MC dates and leave dates do not overlap.
   - **UNSUPPORTED** — PDF certificates remain uploadable but are left for human review because the vision path only accepts images.

**Live checks performed:**

| Scenario | Result |
|---|---|
| Image MC dated 11 August; leave dated 11 August | MATCH; clinic name read correctly |
| Image MC dated 3–4 August; leave dated 13 August | MISMATCH; dates explained clearly |
| PDF certificate | UNSUPPORTED; clear explanation and no crash |
| No attachment | HTTP 400 |
| Another employee's request | HTTP 403 |

**Audit/privacy decision:** only the employee can initiate the check; the result is advisory and never changes approval or balances. `ai_interactions` stores the request id, attachment type and verdict/dates — not the image data or extracted medical text.

**Important documentation follow-up:** the HLD currently says no raw PII is sent to the LLM. An MC is health data. Before presenting this as a production feature, the team must either amend the HLD privacy section/UC-13 for explicit employee consent, or replace the hosted vision call with local OCR. The code comments make this limitation explicit.

---

## 4. Country and team dropdowns

**Prompt:** *"change the country to a dropdown by country (following country leave policies countries) and the team to a dropdown by teams (A or B) for the adding employee ... and invitation"*

**What the AI did:** checked the actual policy and user records rather than hard-coding a second country/team list.

**Implementation:**

- Added `GET /user/teams`, which returns the real teams currently stored in the user table. It is available only to Supervisor, Manager and HR Admin roles.
- HR Admin **Add employee**: country is a dropdown of the ten leave-policy countries; team is a dropdown of the available teams.
- HR Admin **Invite a new employee**: same country and team dropdowns.
- Manager **Add employee**: country was already policy-backed; team is now a dropdown.
- Supervisor **Add employee**: the same team dropdown is shown but locked to the supervisor's own team, matching the backend authorisation rule.

**Live checks performed:**

- Both HR forms showed 10 policy countries and 2 teams (Compliance Team A/B).
- Manager form showed 10 countries and both teams.
- Supervisor form showed both teams but was disabled and retained the supervisor's own team.
- Created a temporary employee through the real endpoint with **Thailand / Compliance Team B**. The system applied Thailand's policy correctly: annual 8, sick-with-MC 30, sick-without-MC 0. The temporary employee was removed after the check.

**Judgement applied:** teams are derived from users, not hard-coded as A/B. If the company creates Team C later, it appears automatically in the dropdown.

---

## 5. Startup failure found during verification

**What happened:** when the new working copy was started for browser testing, MySQL rejected it with:

> `Too many keys specified; max 64 keys allowed`

**Root cause:** four Sequelize models used unnamed `unique: true` columns while `sequelize.sync({ alter: true })` ran on every server start. Sequelize added another unique index each time the app started until each affected table reached MySQL's 64-index maximum.

**Fix:** named the unique constraints in the affected models and added `server/scripts/fixDuplicateIndexes.js` to remove duplicate indexes safely. It removed 248 duplicate indexes from the development database.

**Judgement applied:** this was not part of Member 2's original feature request, but it prevented the app from starting and therefore blocked all verification. The script is retained because teammates can use it if an older shared database has the same drift.

---

## 6. Verification

**Automated checks:**

- Full server test suite: **114 tests passed, 7 suites passed**.
- Client production build completed successfully.
- Existing M2 parser tests continued to pass.

**Browser/API checks:**

- Compound AI-1 request displayed as separate periods.
- Four languages parsed through the live hosted LLM.
- MC MATCH, MISMATCH and unsupported-PDF paths verified.
- Country/team dropdowns verified for HR Admin, Manager and Supervisor roles.
- Temporary test leave requests and temporary employee records were deleted after testing.

---

## Summary of AI contribution

| Where it was useful | Where I applied judgement or added safeguards |
|---|---|
| Finding the single-request limitation in AI-1 | The AI model was not trusted for weekdays; the calendar is now supplied and results are checked against local policy data |
| Translating multilingual leave requests into a consistent English approval reason | Offline fallback remains English-only and the UI identifies the source/language |
| Reading MC image dates and comparing them with leave dates | Opt-in only; advisory only; PDF path deliberately defers to human review |
| Replacing free-text country/team fields with data-backed choices | Team list is derived from actual data, while the backend remains the final authorisation control |
| Discovering the server could not boot because of repeated schema indexes | Fixed the blocker because verification could not continue otherwise; retained a repair script for shared development databases |
