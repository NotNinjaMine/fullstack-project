# Use Cases – Wai Yan Hpone Lat (Member 3)

**Role:** Backend Lead – Workflow & Notifications  
**Owned Use Cases:** UC-01, UC-02, UC-03, UC-12  
**Date:** July 2026  
**Project:** HR Leave Management System (SCCCI AI Challenge)

---

## Introduction

This document details the use cases I am primarily responsible for as Backend Lead. These cover the core leave request lifecycle, the two-tier approval workflow, cancellation handling, and the notification system. All backend logic, state machines, RBAC enforcement, audit logging, and notification triggers are implemented by me.

The use cases follow the detailed specifications from the project’s High-Level Design (HLD) and Use Cases document. I focus on the backend implementation perspective while ensuring full alignment with frontend owners (Member 1 & 2) and supporting services from Member 4 & 5.

---

## UC-01: Employee Applies for Leave (with optional AI input)

**Primary Actor:** Employee  
**Supporting Actors:** System, Supervisor (via notification)  
**Preconditions:**
- Employee is authenticated (valid JWT)
- Employee has available leave balance for the requested type
- Employee belongs to a valid reporting line (supervisor_id and manager_id set)

**Main Flow:**
1. Employee opens the leave application form (frontend).
2. Employee either:
   - Fills the form manually (date range, half/full day, leave type, remarks), **or**
   - Uses AI-1 natural language input (parsed by backend service – coordinated with Member 4).
3. Frontend calls `POST /api/leave` with the structured request.
4. Backend performs:
   - Input validation
   - Balance check via policy engine (Member 4)
   - Overlap detection (calls overlapService)
   - Sets `supervisor_id`, `manager_id`, `status = 'pending'`, `supervisor_status = 'pending'`
   - If overlap detected and coverage below threshold → sets `special_approval_flag = true` and `overlap_flag = true`
5. Request is persisted in `leave_requests` table.
6. `audit_log` entry is written.
7. Notification service triggers in-app + email notification to Supervisor (UC-12).
8. Employee receives confirmation (201 Created) with `days_count` and flags.

**Alternative Flows:**
- **AF-01:** Insufficient balance → 400 `INSUFFICIENT_BALANCE`
- **AF-02:** Invalid date range or half-day on multiple days → 400 `INVALID_DATE_RANGE`
- **AF-03:** Overlap requires special approval → request created with `special_approval_flag = true`
- **AF-04:** AI-1 parsing fails → frontend falls back to manual form (graceful degradation)

**Business Rules:**
- Half-day requests must be single calendar day.
- Leave type is immutable after submission.
- Balance is **not** deducted until final Manager approval.
- Public holidays and weekends are excluded from `days_count` (calculated by Member 4’s policy engine).

**Postcondition:** Leave request exists in `pending` state, visible in employee history and team calendar. Supervisor is notified.

---

## UC-02: Two-Tier Approval Workflow (with AI Assistant)

**Primary Actors:** Supervisor → Manager  
**Preconditions:**
- Request exists in `pending` or `supervisor_approved` state
- Approver has valid role and is in the correct reporting line

**Main Flow (Happy Path):**
1. Supervisor receives notification (UC-12) and opens approval queue (`GET /api/approvals`).
2. Backend returns role-scoped list with `awaiting_role`, `team_on_leave_count`, and AI-3 summary card data (provided by Member 4).
3. Supervisor reviews and calls `PUT /api/approvals/:id/approve` with optional note.
4. Backend:
   - Validates approver role and current state
   - If Supervisor step → sets `supervisor_status = 'approved'`, `status = 'supervisor_approved'`
   - Routes to Manager (`manager_status` remains `pending`)
   - Writes `audit_log`
   - Triggers notification to Manager (UC-12)
5. Manager receives notification, sees the same AI-3 card.
6. Manager approves → `PUT /api/approvals/:id/approve`
7. Backend:
   - Sets `manager_status = 'approved'`, `status = 'approved'`
   - Calls balance deduction logic (Member 4)
   - Writes `audit_log`
   - Triggers final notification to Employee (UC-12)
8. Employee sees updated status in history/dashboard.

**Alternative Flows:**
- **AF-01:** Supervisor rejects → `PUT /api/approvals/:id/reject` → `status = 'rejected'`, balance untouched, employee notified.
- **AF-02:** Coverage insufficient (`special_approval_flag = true`) → Supervisor can still approve but flags it; Manager **must** explicitly approve the exception.
- **AF-03:** Manager rejects after Supervisor approved → request rejected, previous supervisor approval noted in audit log.
- **AF-04:** 24-hour reminder triggered (UC-12) if still pending (reminder only, no auto-approval).

**Business Rules:**
- Both Supervisor **and** Manager must approve. No auto-approval.
- Supervisor cannot be bypassed.
- Balance deducted **only** on final Manager approval.
- Every state change writes an immutable `audit_log` entry.
- AI-3 summary card is read-only assistance — human approver always decides.

**Postcondition:** Request reaches terminal state (`approved` or `rejected`). Balance updated only on approval. Full audit trail exists.

---

## UC-03: Leave Cancellation Request

**Primary Actor:** Employee (Owner)  
**Preconditions:**
- Request exists and belongs to the employee
- Request is not already in terminal cancelled state

**Main Flow:**
1. Employee opens existing leave entry (pending or approved).
2. Selects “Request Cancellation” and provides optional reason.
3. Frontend calls `POST /api/leave/:id/cancel`.
4. Backend logic:
   - If `status = 'pending'` → immediately set `status = 'cancelled'`, restore balance if any was reserved (none yet).
   - If `status = 'approved'` or `supervisor_approved` → set `status = 'cancel_pending'`, route through the same two-tier approval chain (Supervisor → Manager).
5. `audit_log` written.
6. Notifications sent to relevant approvers (UC-12).
7. On final cancellation approval → balance restored, `status = 'cancelled'`.

**Alternative Flows:**
- **AF-01:** Attempt to cancel already cancelled/rejected request → 409 `ALREADY_CANCELLED`
- **AF-02:** Non-owner tries to cancel → 403 `FORBIDDEN`

**Business Rules:**
- Leave type cannot be changed — only cancellation is allowed.
- Cancellation of approved leave follows the full two-tier workflow.
- Balance is restored only on successful cancellation approval.

**Postcondition:** Request is cancelled or in `cancel_pending` state. Balance is correctly adjusted. Full audit trail maintained.

---

## UC-12: Notifications

**Primary Actor:** System (triggered by workflow events)  
**Supporting Actors:** Employee, Supervisor, Manager, HR Admin

**Triggers & Notification Types:**

| Trigger Event                    | Recipients                  | Channels          | Type in DB                  |
|----------------------------------|-----------------------------|-------------------|-----------------------------|
| New leave request submitted      | Supervisor                  | In-app + Email    | `leave_submitted`           |
| Supervisor approves/rejects      | Manager                     | In-app + Email    | `supervisor_approved` / `supervisor_rejected` |
| Final Manager decision           | Employee                    | In-app + Email    | `approved` / `rejected`     |
| 24-hour pending reminder         | Current approver            | In-app + Email    | `approval_reminder`         |
| Overlap warning at submit time   | Employee                    | In-app            | `overlap_warning`           |
| Year-end carry-forward complete  | Employee + HR Admin         | In-app + Email    | `carry_forward_complete`    |
| Cancellation request             | Relevant approvers          | In-app + Email    | `cancel_pending`            |

**Main Flow (Backend):**
1. Workflow event occurs (e.g., `POST /api/leave` succeeds).
2. `notificationService` is called with event type, user IDs, and context.
3. Service:
   - Creates `notifications` row(s)
   - If email channel enabled in user preferences → sends via Nodemailer
4. Frontend polls or uses WebSocket/context to show unread count and list (`GET /api/notifications`).
5. User marks as read (`PUT /api/notifications/:id/read` or `read-all`).

**Business Rules:**
- 24-hour reminder is **reminder only** — never auto-approves.
- Users can configure notification preferences (email / in-app) per event type (UC-23, supported via Member 1).
- No sensitive PII is sent in email notifications.
- All notifications are auditable via `audit_log` where relevant.

**Postcondition:** Relevant users receive timely notifications through chosen channels. Unread count is accurate.

---

## Cross-Cutting Concerns (Implemented by Me)

- **RBAC Enforcement:** Every protected endpoint uses `requireRole()` middleware. Unauthorised access returns 403.
- **Audit Logging:** Every state-changing action (create, approve, reject, cancel, notification sent) writes an immutable row to `audit_log`.
- **Error Handling:** All endpoints return the standard envelope:
  ```json
  { "success": false, "code": "ERROR_CODE", "message": "Human readable" }
  ```
- **JWT Security:** Short-lived tokens + refresh strategy (to be extended). Passwords hashed with bcrypt.
- **Coordination Points:**
  - Overlap & days_count calculation → Member 4’s `overlapService` and `policyEngine`
  - AI-1 / AI-3 data → Member 4’s AI service module
  - Public holidays & balance queries → Member 4 / Member 5

---

## Summary of My Backend Responsibilities

| Use Case | Backend Components I Own                          | Integration With Others          |
|----------|---------------------------------------------------|----------------------------------|
| UC-01    | leaveController, validation, overlap call, audit  | Member 4 (overlap/policy/AI-1)   |
| UC-02    | approvalController, two-tier state machine        | Member 4 (AI-3 summary)          |
| UC-03    | cancel logic + re-routing through approval        | Same as UC-02                    |
| UC-12    | notificationService, triggers, routes             | Member 1 (preferences UI)        |

These use cases form the **heart of the approval workflow** that directly solves the client’s “approvals take a week or more” pain point.

---

*Document prepared for individual submission – A1 criteria.*  
*All flows have been cross-checked against the official HLD and Use Cases documents.*