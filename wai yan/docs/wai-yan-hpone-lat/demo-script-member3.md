# Demo Script — Member 3 (Approval + Notifications)

**Duration:** ~4–5 minutes  
**Password for all demos:** `Password123!`

---

## Setup (before client enters)

```bash
cd backend && npm run seed && npm run dev
cd frontend && npm run dev
```

Tabs open: Login page, and optionally DB viewer for `audit_log`.

---

## Script

### 1. Context (20s)
> “I’m Member 3 — Backend Lead for workflow and notifications. I’ll show the two-tier approval flow, balance rules, notifications, audit trail, and the AI assistant card.”

### 2. Employee applies (45s)
1. Login **alice.tan@company.com**
2. Dashboard → show **leave balances** (annual/sick)
3. **Apply leave** → pick next weekdays → submit  
4. Point out: status **pending**, no balance deducted yet  
5. Open **Notifications** as Alice (maybe overlap warning only)

### 3. Supervisor step (60s)
1. Logout → **bob.supervisor@company.com**
2. Show **Notification** badge / list: leave submitted  
3. **Approval Queue**  
4. Open a card → show **AI-3 Approval Assistant** (risk + recommendation — *human decides*)  
5. Optional: show bulk bar / export CSV  
6. **Approve** with note “Coverage confirmed”  
7. Say: “Status is now **supervisor_approved**. Manager cannot be skipped.”

### 4. Manager final (45s)
1. Login **carol.manager@company.com**
2. Queue → approve  
3. Emphasize response field **`balance_deducted`** / balance only now  
4. Alice’s leave is **approved**

### 5. Rejection edge case (30s) — optional if time
1. New leave as Alice  
2. Bob **Reject** without note → show error  
3. Reject with note → **rejected**, no balance change  

### 6. Cancel flow (40s)
1. Alice cancels the **approved** leave → **cancel_pending**  
2. Bob + Carol approve cancel → **cancelled**, balance restored  

### 7. Audit + extras (30s)
1. Show `audit_log` in DB (or prepared screenshot)  
2. Quick flash: **Team calendar** + holidays, **Delegations**, **Who’s away**

### 8. Close (15s)
> “Every transition is transactional and audited. Notifications fire on the right roles. AI assists but never auto-approves.”

---

## If something fails

| Issue | Recovery |
|-------|----------|
| Empty queue | Re-seed; apply leave as Alice again |
| No email | Explain SMTP_MODE / GoDaddy; show console log or in-app |
| AI shows rule_engine | “Fallback when LLM key offline — still advisory” |
| Login fails | `npm run seed` |

---

## One-liners for Q&A

- **Why two tiers?** Client pain: slow/opaque approvals; both supervisor and manager must sign.  
- **Why audit JSON?** Immutable before/after for compliance grading.  
- **Why AI?** Risk hints only — decision_required true, no auto-approve.  
- **Security?** JWT + bcrypt + RBAC on every protected route + parameterized SQL.  
