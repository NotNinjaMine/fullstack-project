# AI Log — M3 Design and Workflow Build

**Date:** 9 July 2026  
**Student:** Wai Yan Hpone Lat  
**Phase:** requirements, architecture, and first vertical implementation

## Context supplied to AI

- Member 3 owns approval, delegation, notifications, and AI-assisted approval review.
- The required normal chain is Employee → Supervisor → Manager.
- A human must always make the final decision.
- Every material action needs an audit trail.

## Prompt 1

> Read the project guide and map Member 3 use cases to an approval state machine, API routes, database records, UI screens, and tests. Do not invent actors or permit a Manager to bypass the Supervisor.

### Output summary

The assistant proposed pending Supervisor and Manager states, role-gated queue/decision routes, a notification entity, delegation dates, and an AI summary card. It also suggested separating routes, controllers/services, and database work.

### My decision

I accepted the state-machine structure and separation of responsibilities. I rejected extra approval statuses and endpoints that were not required by the guide. I made the backend, rather than UI visibility, the authority boundary.

## Prompt 2

> Implement two-tier approval with a database transaction. Supervisor approval must only advance the request. Final approval alone may deduct balance. Add an audit row and require a rejection reason.

### Output summary

The assistant produced a transactional decision flow and test ideas for wrong-tier access, repeat decisions, rejection, and balance timing.

### My modifications

- Kept the request status and balance update in one transaction.
- Required rejection text rather than permitting a silent rejection.
- Moved notifications outside the transaction so email/provider failure cannot undo a correct business decision.
- Added the rule that no approver may decide their own request.

## Prompt 3

> Add a 24-hour reminder for the current approval tier. It must notify only, never auto-approve or auto-reject, and it must not send repeatedly on every scheduler sweep.

### Output summary

The assistant initially suggested elapsed time from request creation and discussed optional escalation behavior.

### My decision

I changed the design to measure from `stageEnteredAt`. Otherwise a request that waited 23 hours for a Supervisor could trigger a Manager reminder one hour after changing tiers. I rejected any automatic decision. A stable reminder claim makes repeated sweeps idempotent.

## Prompt 4

> Design AI-3 as an approval summary using real history and coverage. It must remain advisory, preserve RBAC, and work when the hosted provider is unavailable.

### Output summary

The assistant proposed patterns, notice period, team coverage, and a recommendation with a provider-backed narrative.

### My modifications

- Kept recommendation labels advisory and separated from the decision route.
- Required request-level authorization before data is collected.
- Kept deterministic/rule-based fallback behavior for provider outage and demos.
- Logged AI interactions for traceability without treating them as approvals.

## Verification at this phase

The initial vertical was exercised through local login/approval flows and backend scripts. Later integration work replaced portions of this first implementation, so the current source and current tests—not this log—are the source of truth.
