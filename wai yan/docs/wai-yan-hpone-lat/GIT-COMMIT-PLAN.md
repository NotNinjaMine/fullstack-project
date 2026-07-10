# Git commit plan — Member 3 (Wai Yan Hpone Lat)

The project folder is **not yet a git repo** (`fatal: not a git repository`).  
Use this plan when you initialise or push to the **team remote**.

---

## One-time setup (team repo)

If the team already has a remote, clone that and copy your `backend/`, `frontend/`, and `docs/wai-yan-hpone-lat/` in carefully.

If you start local history for your portion:

```bash
cd C:\Users\waiya\Downloads\grok_testing
git init
git checkout -b member3/workflow-notifications
```

Add a root `.gitignore` if missing (node_modules, .env, data/, dist/).

**Never commit:** `backend/.env` with real passwords or API keys.

---

## Recommended commit sequence (clean story for markers)

Copy-paste messages as needed. Prefer **several small commits** over one giant dump.

### 1 — Project scaffolding
```
feat(backend): scaffold Express app, config, and response helpers

Add app.js, server.js, env example, DB adapters (sqlite/pg), and
standard success/error envelope utilities for Member 3 APIs.
```

### 2 — Auth + RBAC
```
feat(backend): add JWT login, /me, and role middleware

Implement bcrypt password verify, authMiddleware, requireRole, and
UNAUTHORISED/FORBIDDEN handling for protected routes.
```

### 3 — Leave lifecycle (supports approval demos)
```
feat(backend): implement leave create, list, detail, cancel, overlap

Add policyEngine days_count, balance checks, overlap flags, and
audit + notify on create/cancel per workflow rules.
```

### 4 — Core UC-02 approvals
```
feat(backend): two-tier approval and reject with transactions

Supervisor then manager approve; reject requires note; balance deduct
only on final manager approve; audit_log before/after every change.
```

### 5 — UC-12 notifications
```
feat(backend): notification triggers, read APIs, and reminder job

In-app notifications plus email/WhatsApp channel hooks; 24h reminder
never auto-approves.
```

### 6 — UC-08 / 15 / 16 + AI-3
```
feat(backend): calendar, history, delegation, bulk approve, AI summary

Add approver calendar/history, approval_delegations, bulk actions, and
AI-3 assistant card with OpenRouter/rule-engine fallback.
```

### 7 — Dashboard polish
```
feat(backend): dashboard balances, who's away, holidays, CSV export

Support usability features for demo: leave balance, team away board,
public holidays, and CSV downloads.
```

### 8 — Frontend vertical
```
feat(frontend): approval queue, notifications, calendar, dashboard

Wire Axios services and pages for login, leave, approvals, bulk,
delegation, AI card, balances, and CSV export.
```

### 9 — Tests + grade scripts
```
test(backend): add approval integration tests and grade-check script

Cover two-tier flow, RBAC, reject notes, AI summary presence, and
ALREADY_ACTIONED using node:test against live API.
```

### 10 — Individual submission docs
```
docs: add Member 3 use cases, API docs, schema notes, demo script

Include docs/wai-yan-hpone-lat pack and AI reflection/logs scaffold
for individual A1 / Section C submission.
```

---

## Short “single PR” message (if team wants one commit)

```
feat(member3): workflow & notifications vertical for leave approvals

Implement JWT/RBAC, two-tier approve/reject with audit and balance
rules, multi-channel notifications, calendar/delegation/bulk, AI-3
summary, dashboard exports, React approval UI, tests, and individual
documentation.
```

---

## What good Git evidence looks like for Grade A

- Branch named for your work (`member3/...`)  
- Messages explain **why** (workflow rules), not only “fix”  
- No secrets in history  
- PR description links to UC-02 / UC-12 and demo steps  
- You can show 1–2 meaningful review comments or fixes if teamwork is graded  

---

## After commits

```bash
git remote add origin <team-repo-url>
git push -u origin member3/workflow-notifications
# open PR into main/develop per team process
```
