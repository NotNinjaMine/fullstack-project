# AI Reflection — Wai Yan Hpone Lat

**Project:** HR Leave Management System (SCCCI AI Challenge)  
**Role:** Member 3 – Backend Lead (Workflow & Notifications)  
**Focus:** UC-02 two-tier approval, UC-12 notifications, related workflow features  

---

## How I used AI (not only for coding)

I used AI coding assistants across the full lifecycle, not as a one-shot code generator.

| Stage | AI use | My control |
|-------|--------|------------|
| Design | Mapped HLD use cases to endpoints and the leave status state machine | Kept only statuses and fields from the HLD; rejected invented APIs |
| Implementation | Scaffolded Express layers (routes → controllers → services) and React pages | Reviewed every JWT/RBAC path and business rule |
| Testing | Suggested edge cases and automated grade/smoke scripts | Ran live HTTP tests; fixed real failures |
| Debugging | Helped interpret login failures and DB driver issues | Root-caused flaky dual-process DB access; chose SQLite for reliable local demos |
| Documentation | Structured use-case and API write-ups | Aligned names to the official API/schema docs |

My habit was **iterative prompting → run the server → prove with requests**, not paste-and-hope.

---

## Where AI helped most

AI was strongest on **structure and speed**: consistent response envelopes, transaction wrappers, notification fan-out (in-app + email + WhatsApp hooks), and UI shells for the approval queue and dashboard. It also helped me think through cancel flows—when balance should restore (`prior_status = approved` only) versus immediate cancel of `pending` leave.

For AI-3 (approval assistant), AI helped design a card with risk level and recommendation while keeping **decision_required: true**, so the system never auto-approves.

---

## Where I rejected or changed AI output (critical use)

| AI suggestion | My decision | Reason |
|---------------|-------------|--------|
| Auto-approve after 24 hours | **Rejected** | Spec: reminder only; auto-approve breaks trust and grading rules |
| Manager approve while still `pending` | **Rejected** | Supervisor must not be bypassed |
| Rich PII in email/WhatsApp bodies | **Rejected** | Security requirement: no sensitive PII in notification channels |
| Extra endpoints not in the API doc | **Rejected** | Delivery is spec-driven for marking |
| LLM-only AI-3 with no fallback | **Modified** | Added rule-engine fallback so demos work offline |
| HR can approve requests | **Rejected** | RBAC matrix: HR may view the queue, not approve |

These choices matter for Section C: AI optimises for “something that runs”; **I owned policy, security, and rubric alignment**.

---

## Iterative workflow example

I did not ask “build the whole backend” once. Example sequence:

1. Two-tier approve/reject with DB transactions and `audit_log` before/after.  
2. Cancel path: `cancel_pending` and balance restore rules.  
3. Notifications + 24h reminder that never changes status.  
4. AI-3 summary (OpenRouter optional) + advisory-only wording.  
5. Automated checks proving manager bypass is impossible.

Each step was verified with login flows (Alice → Bob → Carol) and scripts (`npm test`, `npm run grade`).

---

## What I learned

1. **Put non-negotiables in the prompt** (audit log, no auto-approve, exact error codes).  
2. **Test immediately**—AI can produce code that fails on real dates, years, or roles.  
3. **Prefer small changes** over regenerating whole modules (easier review, cleaner Git history).  
4. **AI for breadth, human for policy**—speed comes from AI; grade quality comes from critical review against the HLD.

---

## Limitations (honest)

AI sometimes chose leave dates in a year without seeded balances, and early embedded-Postgres setups caused confusing login errors under two processes. I fixed these by aligning tests to the seeded year and standardising on SQLite for local demos, with Postgres schema still available.

---

## Conclusion

AI accelerated scaffolding, exploration, and documentation structure. **Grade A outcomes required human judgment**: enforcing the two-tier state machine, RBAC, audit logging, safe notifications, and live verification. I used AI as a pair programmer, not as an unsupervised author of production logic.

---

*Optional: insert module code, word count, and 2 short excerpts from `ai-logs/` before final submit.*
