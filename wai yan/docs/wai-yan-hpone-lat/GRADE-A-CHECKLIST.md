# Grade A Checklist — Member 3 (updated against actual repo)

**Date:** 2026-07-10  
**Name:** Wai Yan Hpone Lat  

Legend: **Done** | **Config only** | **You write personally**

---

## 1. Technical build

| Criteria | Excellent target | Status |
|----------|------------------|--------|
| System design / APIs | Documented + state machine | **Done** → `docs/wai-yan-hpone-lat/` |
| Code quality | Envelope, validation, transactions, RBAC | **Done** |
| Two-tier approval | Full flow + no bypass | **Done** |
| Notifications | Triggers + UI + email/WA hooks | **Done** (email/WA need keys) |
| Edge cases | Error codes | **Done** |
| Security | JWT + RBAC | **Done** |
| Audit trail | before/after every state change | **Done** |
| Approval Queue FE | Functional | **Done** (`ApprovalQueuePage`) |
| Notifications FE | Functional | **Done** (`NotificationsPage`) |
| Calendar / bulk / delegation | UC-08/15/16 | **Done** |
| Dashboard balances / CSV | Usability | **Done** |
| Automated tests | Approval tests | **Done** → `backend/tests/approval.test.js` |

---

## 2. Documentation (individual)

| Document | Path | Status |
|----------|------|--------|
| use-cases.md | `docs/wai-yan-hpone-lat/use-cases.md` | **Done** |
| api-documentation.md | `docs/wai-yan-hpone-lat/api-documentation.md` | **Done** |
| database-schema.md | `docs/wai-yan-hpone-lat/database-schema.md` | **Done** |
| Demo script | `docs/wai-yan-hpone-lat/demo-script-member3.md` | **Done** |
| AI reflection | `ai/wai-yan-hpone-lat/ai-reflection.md` | **Draft — personalise** |
| AI logs | `ai/wai-yan-hpone-lat/ai-logs/` | **Scaffold — add more logs** |

---

## 3. Demo readiness

| Item | Status |
|------|--------|
| Demo script | **Done** |
| Seed users | **Done** |
| Practice Alice → Bob → Carol | **You rehearse** |
| Show audit_log | **You rehearse** (SQL or tool) |
| Configure GoDaddy email | **Config only** |
| OpenRouter key for AI-3 | **Config only** |

---

## 4. AI Section C (20%)

| Item | Status |
|------|--------|
| Multi-phase AI use | Evidence in logs + reflection |
| Iterative prompting | Described in reflection |
| Critical rejection of AI | Table in reflection — **add your voice** |
| ai-logs folder | Started — **append real sessions** |

---

## 5. Outdated advisor list vs reality

| Advisor said | Actual |
|--------------|--------|
| Notifications UI not started | **Built** |
| Approval Queue started only | **Built** (+ bulk, AI card) |
| Tests not started | **Added** |
| Docs partially done | **Packaged under your name folder** |

---

## Commands before submission

```bash
cd backend
npm run seed
npm run dev          # terminal 1
npm test             # terminal 2 (API up)
npm run grade

cd frontend
npm run dev
```

---

## Personal todos only you can finish

1. Personalise `ai-reflection.md` (first person, course details).  
2. Add 2–3 real AI chat excerpts into `ai-logs/`.  
3. Put real GoDaddy mailbox + optional OpenRouter key in `.env`.  
4. Rehearse demo script once out loud.  
5. Commit with clear messages (team Git evidence).  
