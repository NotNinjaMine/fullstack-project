# Building a leave app for a real client — pro playbook

How a senior product-minded developer approaches a request like:  
**“Build an app for leave requests and approvals.”**

---

## Phase 0 — Discover (before any code)

1. **Who is the client?** SME HR, school, factory, multi-country company?  
2. **Who uses it daily?** Employees, supervisors, HR, finance?  
3. **What pain exists today?** Spreadsheets, email chaos, slow approvals, audit risk?  
4. **Hard rules:** Who must approve? Can balance go negative? Sick leave need MC?  
5. **Constraints:** Budget, timeline, must use their domain email, WhatsApp, SSO?  
6. **Success metric:** “Approvals under 48h”, “Zero lost requests”, “Audit for ISO”.

**Output:** 1-page problem statement + user roles + must-have list.

---

## Phase 1 — Scope MVP (must-have only)

### Must-have features (real clients almost always need)

| Priority | Feature | Why clients pay for this |
|----------|---------|---------------------------|
| P0 | Login + roles (employee / supervisor / manager / HR) | Security & trust |
| P0 | Apply leave (type, dates, half-day, remarks) | Core job |
| P0 | See **balance** before applying | Stops wrong requests |
| P0 | Approval workflow (at least 1–2 tiers) | Control & accountability |
| P0 | Team **calendar / who’s away** | Planning |
| P0 | Notifications (in-app + email) | Speed |
| P0 | History of my requests | Self-service |
| P0 | Error handling (insufficient balance, already actioned) | Trust |
| P0 | Audit trail of decisions | Compliance / disputes |
| P1 | Cancel leave (esp. approved) | Real life changes |
| P1 | Overlap / coverage warning | Operations |
| P1 | Export CSV (leave, approvals, summary) | HR reporting to Excel |
| P1 | Mobile-responsive UI | Phone usage |
| P2 | Delegation, bulk approve | Manager productivity |
| P2 | AI assist (summary, NL apply) | Differentiation |
| P2 | WhatsApp / Slack | Channel preference |
| P3 | Payroll sync, full legal engine | Enterprise only |

**Rule:** Ship P0 solid before fancy AI.

---

## Phase 2 — UX principles (what clients feel)

### Design goals
1. **One primary action per screen** — “Apply”, “Approve”, “Export”.  
2. **Status always visible** — coloured badges, not hidden text.  
3. **Balances above the fold** — like banking apps show money.  
4. **Approver queue sorted by urgency** — oldest / high-risk first.  
5. **Empty states that teach** — “No pending approvals — you’re clear.”  
6. **Errors in plain language** — not only `ALREADY_ACTIONED`.  
7. **Mobile first** — thumbs can approve on the train.  
8. **Never auto-approve without explicit product decision.**

### Screen map (MVP)

```
Login
 → Dashboard (balance, who’s away, pending count, exports)
 → Apply leave
 → My history (+ detail / cancel)
 → Approvals queue (if role)
 → Team calendar
 → Notifications
```

### UI checklist
- Consistent spacing, type scale, primary colour  
- Loading + disabled buttons on submit  
- Confirm destructive actions (cancel approved leave)  
- Accessible contrast; keyboard forms  
- Export buttons where managers expect reports  

---

## Phase 3 — Architecture (how you build)

1. **API-first** — same backend for web and future mobile.  
2. **Clear modules:** Auth · Leave · Approvals · Notifications · Reports.  
3. **State machine** for leave status (documented).  
4. **RBAC** on every protected route.  
5. **Transactions** for approve + balance + audit.  
6. **Parameterized SQL** / ORM.  
7. **Env-based config** for SMTP, AI keys, WhatsApp.  
8. **Seed data** for demos and tests.

---

## Phase 4 — Delivery process

| Step | Activity |
|------|----------|
| 1 | Wireframes (Figma or paper) — 1 day |
| 2 | API contract + DB schema review with client |
| 3 | Auth + leave apply (vertical slice) |
| 4 | Approval path + notifications |
| 5 | Calendar + balances + CSV |
| 6 | Hardening: errors, audit, tests |
| 7 | UAT with 3 real users (employee, boss, HR) |
| 8 | Deploy + training (15 min video + 1-pager) |
| 9 | Hypercare (1–2 weeks bugfix) |

**Agile tip:** Demo every week with a real journey, not a feature dump.

---

## Phase 5 — What “pro” means for this product

| Area | Pro standard |
|------|----------------|
| Security | JWT, password hash, least privilege, no secrets in git |
| Reliability | Transactions; failed email does not break approve |
| Observability | Logs, audit_log for disputes |
| Performance | Indexed queries; list pagination later |
| Compliance | Audit, retention policy discussion with client |
| AI | Assistive only; human decides; fallbacks |

---

## Mapping: this checklist vs *your* app today

| Client must-have | Your app |
|------------------|----------|
| Apply + history | Yes |
| Two-tier approval | Yes |
| Balance on dashboard | Yes |
| Calendar / who’s away | Yes |
| Notifications | Yes (email/WA configurable) |
| CSV export | Yes (leave, approvals, **summary**, who’s away) |
| Audit log | Yes |
| AI assist | Yes (balance, NL apply, notes, policy Q&A) |
| Mobile native app | Responsive web only (enough for many SMEs) |
| Slack / Outlook sync | Not yet (P2) |

You already cover a **strong SME leave product MVP+**.

---

## One-slide pitch to a client

> “Employees request leave in under a minute, see remaining days, and get notified.  
> Supervisors and managers approve in a two-step workflow with full audit history.  
> HR exports CSV summaries for payroll and planning.  
> Optional AI helps write notes and summarise balances — humans always decide.”

---

*Use this for interviews, client discovery, or your challenge reflection.*
