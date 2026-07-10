# Use Cases — Wai Yan Hpone Lat (Member 3)

**Role:** Backend Lead – Workflow & Notifications  
**Primary UCs:** UC-02, UC-12  
**Also owned / shared:** UC-08, UC-15, UC-16, AI-3  

---

## UC-02: Two-Tier Approval Workflow (with AI Assistant)

### Summary
Core deliverable. Every leave request must be approved by **supervisor then manager**. No auto-approval. Balance deducted only on final manager approval.

### Actors
- Supervisor (step 1)
- Manager (step 2)
- Optional: Acting approver (UC-15)

### Preconditions
- Valid JWT
- Leave request in `pending` or `supervisor_approved` (or `cancel_pending` for cancels)
- Approver is assigned on the request **or** active delegate

### Main flow
1. Supervisor opens **Approval Queue** → `GET /api/approvals`
2. Each item includes `awaiting_role`, `team_on_leave_count`, **AI-3 `ai_summary`**
3. Supervisor `PUT /api/approvals/:id/approve` (+ optional note)
4. System sets `supervisor_status=approved`, `status=supervisor_approved`
5. Writes **audit_log** (before/after)
6. Notifies manager (UC-12)
7. Manager approves → `status=approved`, **balance deducted**, employee notified

### Alternative flows (edge cases)

| ID | Scenario | Expected result |
|----|----------|-----------------|
| AF-01 | Supervisor rejects | `status=rejected`, note **required**, no balance change, employee + manager notified |
| AF-02 | Manager tries to approve while still `pending` | `403` / `409` — **cannot bypass supervisor** |
| AF-03 | Double approve after final | `409 ALREADY_ACTIONED` |
| AF-04 | HR tries to approve | `403 FORBIDDEN` (view queue only) |
| AF-05 | `special_approval_flag` / overlap | Request still needs human approve; AI-3 raises risk |
| AF-06 | 24h still pending | `approval_reminder` only — **never auto-approves** |
| AF-07 | Cancel of approved leave | `cancel_pending` → same two-tier → restore balance if was fully approved |
| AF-08 | Cancel of pending leave | Immediate `cancelled`, no balance change |
| AF-09 | Acting delegate approves | Allowed when UC-15 delegation is active |

### Business rules
- Both tiers required; supervisor cannot be skipped  
- Balance only on final manager approve  
- Rejection requires a note  
- Every transition audited  

### Postcondition
Terminal state `approved` or `rejected` (or `cancelled` after cancel flow), audit trail complete, notifications sent.

---

## UC-12: Notifications (In-app + Email)

### Summary
System triggers multi-channel alerts on workflow events. In-app always; email via SMTP (GoDaddy/etc.); WhatsApp optional.

### Triggers

| Event | Recipient | Type | Channels |
|-------|-----------|------|----------|
| Leave submitted | Supervisor | `leave_submitted` | In-app + email + WhatsApp |
| Supervisor approved | Manager | `supervisor_approved` | In-app + email + WhatsApp |
| Supervisor rejected | Manager + employee | `supervisor_rejected` / `rejected` | In-app + email + WhatsApp |
| Manager final decision | Employee | `approved` / `rejected` | In-app + email + WhatsApp |
| Cancel pending | Approvers | `cancel_pending` | In-app + email + WhatsApp |
| Overlap at submit | Employee | `overlap_warning` | In-app only |
| 24h pending | Current approver | `approval_reminder` | In-app + email |

### Edge cases
- SMTP misconfigured → console/log fallback; workflow still succeeds  
- User has no phone → WhatsApp skipped  
- No PII in email/WhatsApp bodies (type, dates, app link only)  
- Mark read / read-all only for owner of the notification  

### Integration
- FE polls notification list + badge  
- Reminder job never changes leave status  

---

## UC-08: Role-Based Calendar & History (Approver)

### Summary
Approvers (and acting delegates) view team leave on a calendar and history table, scoped by reporting line / department.

### Endpoints
- `GET /api/approvals/calendar?start_date=&end_date=`
- `GET /api/approvals/history?year=`
- Holidays: `GET /api/dashboard/holidays`

### Edge cases
- Employee with no delegation → empty scope (no crash)  
- Holidays coloured on calendar by country  

---

## UC-15: Approval Delegation

### Summary
Supervisor/manager creates a time-bound acting approver.

### Edge cases
- Cannot delegate to self  
- Revoke sets `active=false`  
- Outside date range → no acting rights  
- Audit on create/revoke  

---

## UC-16: Bulk Approval with Comments

### Summary
`POST /api/approvals/bulk` with `{ action, ids, note }` — partial success allowed per id.

### Edge cases
- Bulk reject requires note  
- Max 50 ids  
- Per-item errors returned without failing whole batch  

---

## AI-3: Approval Assistant

### Summary
Each queue item includes `ai_summary` (risk, bullets, recommendation).  
Uses OpenRouter/OpenAI when configured; otherwise rule engine. **Human always decides.**

### Critical use of AI
- Assistive only; not used for auto-approval  
- Falls back if API fails  
- Payload to LLM avoids unnecessary PII  

---

## Integration with other members

| Member | Integration |
|--------|-------------|
| M1/M2 FE | Consume my REST APIs + envelopes |
| M4 | policy/overlap simplified stubs live under my services |
| M5 | schema/seed coordinated; SQLite local + Postgres DDL |

---

*Document for individual A1 criteria — Member 3.*
