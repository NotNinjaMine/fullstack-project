# AI Log — M3 Hardening and Edge Cases

**Date:** 3 August 2026  
**Student:** Wai Yan Hpone Lat  
**Phase:** authorization, concurrency, comments, notification safety

## Prompt 1

> Audit the complete M3 implementation for ways a direct API caller can bypass the UI. Focus on team isolation, delegation, self-approval, stale requests, and concurrent final decisions.

### Output summary

The assistant traced queue filtering and decision authorization separately, identified that authorization must be rechecked after locking the request, and proposed request/balance row locks for final approval.

### Decisions and changes

- Kept both queue filtering and endpoint authorization; one is not a replacement for the other.
- Revalidated the current tier and actor after the request row is locked.
- Locked the relevant balance row before checking and changing `used`.
- Returned per-request failures in bulk processing instead of converting one bad row into a misleading whole-batch failure.
- Excluded coverage-flagged requests from bulk approval because acknowledgement requires individual review.

## Prompt 2

> Add same-tier, date-bounded delegation without moving requests to the delegate's team. Prevent delegation chains and overlapping authority.

### Output summary

The assistant proposed a delegation lookup, an `actingFor` display field, candidate filtering, and lifecycle notifications.

### Decisions and changes

- Authority stays tied to the employee's original chain.
- Delegates must have the same role and an active account.
- The date window is inclusive and auto-expires through authorization checks.
- Revocation sets historical fields instead of deleting the row.
- A received delegation cannot be re-delegated into a chain.

## Prompt 3

> Implement UC-28 comments for the owner, both original tiers, and active delegates. HR should be audit-read-only. Lock the thread after decision and do not leak private message text into audit summaries.

### Output summary

The assistant produced participant helpers and a transactional comment-plus-audit design.

### Decisions and changes

- Original Supervisor and Manager retain visibility across the complete pending chain.
- Delegates participate only for the authority they cover.
- HR can read but not post.
- Comment and audit entry commit atomically.
- The audit action records that a comment was added, but not its body.

## Prompt 4

> Review notification fan-out for preference handling, duplicate recipients, invalid email, and provider failure. Decisions must already be committed before delivery.

### Output summary

The assistant recommended independent channel outcomes and recipient normalization.

### Decisions and changes

- `notifyInApp` and `notifyEmail` are evaluated independently.
- Duplicate user IDs and normalized email addresses are removed.
- Inactive users are skipped.
- Provider exceptions are sanitized and contained.
- Delivery failure never removes a successful in-app row or rolls back a decision.

## Verification at this phase

Pure unit tests covered delegation, comments, reminder timing, notification recipient resolution, mailer behavior, transaction boundaries, and AI timeout/fallback. MySQL scenarios were retained separately because mocked persistence cannot prove row-lock or balance behavior.
