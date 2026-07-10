# AI log — Workflow & notifications build

**Date:** 2026-07-09  
**Member:** Wai Yan Hpone Lat  
**Tools:** Coding agents (Grok / Claude-style assistants)

## Session goals
- Implement Member 3 backend: auth, leave, two-tier approvals, notifications, audit  
- Support local demo without full Postgres install  
- Add AI-3 assistant, multi-channel notify, dashboard polish  

## Example prompts used (iterative)

1. “Read CLAUDE.md and docs; implement two-tier approval with transactions and audit_log before/after.”  
2. “Manager must not approve while status is pending — return ALREADY_ACTIONED or FORBIDDEN.”  
3. “24h reminder: notify only, never auto-approve.”  
4. “Add OpenRouter AI summary with rule-engine fallback; human decides.”  
5. “Compare to BambooHR/LeaveBoard; add balance dashboard, CSV export, calendar holidays.”  

## AI outputs I changed
- Removed any auto-approval behaviour  
- Forced rejection notes  
- Fixed balance year issues in tests (use 2026 seeded year)  
- Replaced flaky dual PGlite processes with SQLite for local stability  

## Verification
- `npm run grade` / live HTTP checks  
- Manual demo: Alice → Bob → Carol  
- Audit rows inspected after approve  

## Outcome
Working vertical for UC-02 / UC-12 / UC-08 / UC-15 / UC-16 / AI-3 with docs under `docs/wai-yan-hpone-lat/`.
