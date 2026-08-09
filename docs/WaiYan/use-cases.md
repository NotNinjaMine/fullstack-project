# Use Cases — Member 3

**Author:** Wai Yan Hpone Lat  
**Member:** M3 — Approval, Delegation, Notifications, Comments, and AI-3  
**Owned scope:** UC-02, UC-08 (approver/delegation view), UC-12, UC-15, UC-16, UC-28, AI-3

This document describes the behavior implemented in the integrated application. The backend is the security boundary: hiding a button in React never grants or removes authority.

## Actors and approval chain

| Actor | M3 responsibility |
|---|---|
| Employee | Receives decision notifications and participates in their request's comment thread. |
| Supervisor | Reviews the first tier for their assigned/team employees. |
| Manager | Reviews the second tier and performs the final balance-affecting approval. |
| Boss | Reviews a Manager's own leave. Any Manager reviews the Boss's own leave. |
| Delegate | Temporarily acts for a same-tier Supervisor or Manager without changing the employee's original chain. |
| HR Admin | May read a request discussion for audit but cannot approve or post as an approver. |
| System | Enforces routing, transactions, audit records, notification preferences, reminders, and AI fallback. |

Normal employee and HR leave follows:

```text
PENDING_SUPERVISOR -> PENDING_MANAGER -> APPROVED
         |                   |
         +---- REJECTED -----+
```

A Supervisor's own leave starts at `PENDING_MANAGER`. A Manager's own leave uses `PENDING_BOSS`; a Boss's own leave uses `PENDING_MANAGER`. Nobody may decide their own request.

## UC-02 — Approve or reject leave

**Primary actors:** Supervisor, Manager, Boss  
**Goal:** Reach a traceable decision without bypassing a tier or deducting a balance twice.

### Main flow

1. The approver opens their pending queue.
2. The server returns only requests at the actor's tier and within their original or delegated authority.
3. The approver reviews dates, reason, employee, coverage flag, history, comments, and the advisory AI-3 card.
4. The Supervisor approves and the request moves to `PENDING_MANAGER`.
5. The Manager approves and the request moves to `APPROVED`.
6. Only the final approval deducts a tracked leave balance.
7. Each decision writes an append-only audit entry, then notifications are attempted after commit.

### Alternative and edge cases

| Case | Required behavior |
|---|---|
| Rejection at either tier | A reason of 5–300 characters is required; status becomes `REJECTED`; balance is unchanged. |
| Wrong tier | Return a business error; do not change the request. |
| Wrong team/reporting line | Return `403`; do not reveal or mutate the request. |
| Approver's own request | Return `403` even if role and team otherwise match. |
| Coverage-flagged request | Manager must set `acknowledgeException=true`; it cannot be bulk-approved. |
| Two final decisions race | Lock the request and balance rows; at most one deduction can commit. |
| Notification or email fails | Keep the committed decision; delivery is best effort and independent of the transaction. |
| Manager or Boss applies for leave | Route to the conflict-free executive tier; never self-approve. |

## UC-08 — Approver queue, team schedule, and delegation

**Primary actors:** Supervisor, Manager  
**Goal:** Let approvers cover an absence temporarily while preserving the employee's real approval chain.

### Main flow

1. An approver selects an active peer with the same role.
2. They choose a start date, end date, and optional reason.
3. The server rejects self-delegation, past starts, reversed dates, cross-tier delegates, inactive users, and overlapping delegation chains.
4. The delegation is stored and both parties are notified.
5. During the inclusive date window, the delegate sees the covered approver's requests and team schedule with an `actingFor` label.
6. The original approver can revoke the delegation immediately.
7. After the end date, authorization expires automatically even if the historical row remains active for audit.

### Invariants

- Delegation changes the actor, not `employee.team`, request ownership, or the Supervisor→Manager chain.
- Supervisors delegate only to Supervisors; Managers only to Managers.
- A delegate cannot create a delegation chain for authority they merely received.
- The team-calendar endpoint accepts only the caller's own team or an active delegated team.
- Employee accounts may view only their own team calendar and cannot create delegations.

## UC-12 — Receive and manage notifications

**Primary actors:** All authenticated users  
**Goal:** Receive relevant in-app and email updates according to independent preferences.

### Events covered

- a request enters an approval tier;
- a request is approved or rejected;
- a comment is added;
- a delegation is created, revoked, or expires;
- a pending stage reaches the 24-hour reminder threshold;
- a pending request is withdrawn or otherwise leaves an approver's queue.

### Main flow

1. The service resolves recipients from the request's current stage and authorization rules.
2. Duplicate user IDs and normalized email addresses are removed.
3. `notifyInApp` and `notifyEmail` are evaluated independently.
4. In-app messages are persisted for active users who enabled that channel.
5. Email is sent through the shared mailer for active users who enabled email and have a valid address.
6. The user lists notifications, views the unread count, and marks one or all as read.

### Edge cases

- A failure in one channel does not suppress the other channel.
- An inactive or missing user receives neither channel.
- A user cannot mark another user's notification as read.
- Provider errors are sanitized and never roll back the business event.
- Recipient lookup follows the current tier, including the original approver and an active delegate.

## UC-15 — Bulk approve or reject

**Primary actors:** Supervisor, Manager, Boss  
**Goal:** Process several ordinary requests while returning an honest result for each row.

1. The approver selects one or more request IDs and one action.
2. For rejection, one valid rejection reason is required.
3. The server processes each request independently and rechecks authorization and current stage.
4. The response contains `{ id, ok, status? , message? }` for every submitted ID.
5. A failure on one request does not hide successful decisions on other requests.

Bulk processing excludes coverage-flagged requests because they require individual review and explicit acknowledgement. Missing, unauthorized, self-owned, stale-stage, and already-decided requests return per-row failures.

## UC-16 — Pending approval reminders

**Primary actor:** System; Manager/HR Admin/Boss may trigger the demo endpoint  
**Goal:** Remind the currently responsible people after 24 hours without making a decision.

1. The scheduler inspects only pending stages.
2. Age is measured from `stageEnteredAt`, not always from initial submission.
3. At 24 hours, recipients are resolved for the current tier.
4. A reminder key includes the request, stage entry, stage, recipient set, and 24-hour window.
5. The claim is stored so the same stage/recipient window is not sent twice.

Moving from Supervisor to Manager resets the stage clock. A newly responsible delegate can cause a new recipient key, but repeated sweeps with the same key are idempotent. Reminders never auto-approve or auto-reject.

## UC-28 — Request comment thread

**Actors:** Request owner, original Supervisor, original Manager, active same-tier delegates; HR Admin is read-only  
**Goal:** Keep the approval discussion attached to the request and auditable.

### Main flow

1. An authorized participant opens comments in chronological order.
2. While the request is pending, a participant posts a 1–500 character message.
3. Comment creation and its audit record commit in one transaction.
4. Other participants are notified, excluding the author.
5. After approval or rejection, the thread remains readable but becomes append-only and locked for new posts.

Unauthorized teams receive `403`. Empty or oversized comments receive `400`. The audit action records that a comment was added but does not duplicate the private comment body.

## AI-3 — Approval summary and advisory tools

**Primary actors:** Authorized approvers; HR Admin has permitted summary visibility  
**Goal:** Reduce review time while leaving every decision with a human.

The request summary uses real request, employee, history, holiday, and team-coverage data. It returns patterns, per-day coverage, conflicts, notice days, and an advisory recommendation such as `APPROVE`, `APPROVE_NOTE`, or `ESCALATE`.

Related M3 tools provide a queue coverage brief, draft an approve/reject note, and explain a pending status. Hosted-model transport is optional; timeout, provider, and malformed-output paths use deterministic fallback where supported. AI output cannot call the decision endpoint, alter balances, or bypass RBAC. Each interaction is logged in `ai_interactions`.

## Acceptance summary

- Every decision is authorized again on the server and in the decision transaction.
- Supervisor approval never deducts balance; final approval deducts once.
- Delegation is same-tier, date-bounded, reversible, and chain-preserving.
- Comments are participant-scoped, audited, and locked after a terminal decision.
- Notifications honor independent preferences and run after commit.
- Reminders are stage-relative, idempotent, and advisory only.
- AI-3 is authorization-scoped and advisory only.
