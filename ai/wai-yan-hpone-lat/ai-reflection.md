# AI Reflection — Wai Yan Hpone Lat

**Project:** Annual Leave Management System  
**Role:** Member 3 — Approval, Delegation, Notifications, Comments, and AI-3

## How I used AI

I used AI across requirements analysis, implementation, testing, debugging, integration, and documentation. The most effective pattern was not “build M3” as one request. I split the work by invariant: first the state machine, then transaction boundaries, then delegation authority, comment participants, notification delivery, reminders, AI-3, and finally the integrated regression audit.

That sequencing made the output reviewable. After each step I could compare the result with a concrete rule and a test, rather than accepting a large amount of plausible-looking code at once.

## Where AI added the most value

AI was strongest at tracing behavior across files. M3 crosses the queue UI, decision routes, authorization helpers, leave and balance models, audit records, notification delivery, mail templates, reminder scheduling, and AI services. It was easy for a local change to be correct in one file but wrong at a seam.

Examples where AI assistance was valuable:

- identifying every place that must derive from one approval-chain table;
- converting approval and comment operations into explicit transaction boundaries;
- enumerating wrong-tier, wrong-team, self-approval, race, provider-failure, and delegation-window tests;
- separating a persistent employee notification from a temporary approver toast;
- finding that changing seed email addresses did not repair old database rows;
- generating documentation from the actual routes and models instead of memory.

## Decisions I did not delegate to AI

The important decisions were business and security decisions, so I treated AI suggestions as proposals.

| Proposal or risk | My decision | Reason |
|---|---|---|
| Auto-approve after a timeout | Rejected | UC-16 requires a reminder, not an automatic decision. |
| Let a Manager approve a normal employee request before Supervisor review | Rejected | It bypasses the two-tier chain. |
| Let delegation reroute the request to the delegate's team | Rejected | Delegation changes the actor, not request ownership. |
| Put email sending inside the decision transaction | Rejected | A provider outage must not undo a valid decision. |
| Permit silent rejection | Rejected | A meaningful reason is required for the applicant and audit trail. |
| Let HR approve | Rejected | HR has audit visibility but is not an M3 approver. |
| Let AI-3 decide automatically | Rejected | AI-3 is advisory and cannot call the decision mutation. |
| Loosen an assertion when a fixture failed | Rejected | Fixing the fixture preserves what the test is meant to prove. |

## AI output I modified

Reminder timing is a good example. Measuring 24 hours from `createdAt` looked reasonable until the two-tier flow was considered. A request can wait almost a day for the Supervisor and only then enter the Manager stage. The Manager should receive a full review window, so I changed the design to use `stageEnteredAt` and an idempotent key containing the stage and recipient set.

I also modified generic delegation suggestions. Role checks alone were insufficient: authority must match the request's original team or explicit reporting line, delegation must be same-tier, and neither a delegated actor nor an overlapping date range should create an ambiguous chain.

During final evidence work, a test exposed that reminder-key parsing supported only Supervisor and Manager stages even though the integrated approval chain included `PENDING_BOSS`. The correction was small—accept Boss in both current and legacy key formats—but it demonstrated why tests should follow new role paths through every shared helper.

## Testing and verification judgment

I separated pure tests from integration evidence. Pure helpers can prove routing tables, delegation dates, participant authorization, reminder boundaries, and Singapore date conversion without a database. They cannot prove Sequelize row locks, transaction rollback, or real balance persistence. Those behaviors need the MySQL/supertest suite.

I also learned to distinguish these statements:

- “the source contains the behavior”;
- “a unit test exercised the helper”;
- “an integration test exercised the real API and database”;
- “a live provider delivered an email or AI response.”

They are different evidence levels. When MySQL or outbound access was unavailable, I recorded the block rather than calling the feature verified.

## Limitations and responsibility

AI can produce confident output that is internally consistent but misaligned with the assignment or integrated system. It can also write tests that merely repeat an implementation assumption. My responsibility was to keep the assignment guide and current repository as sources of truth, inspect diffs, run checks, and preserve teammates' features.

Credentials and private data required additional care. I did not place real SMTP or hosted-model secrets in source or logs, and I did not reuse credentials exposed in earlier conversations. Approval responses use allowlisted employee fields so authentication details do not leak through eager-loaded user objects.

## What I would do differently

1. Define the approval-chain contract and reporting-line fields with the team before parallel feature work begins.
2. Put every member's docs, tests, and AI logs in the final required folder structure from the first week.
3. Add executive-role cases whenever a new role is added, not only to the main route but to reminders, comments, notifications, and UI status labels.
4. Maintain a dedicated test database continuously so concurrency and row-lock checks run on every integration.
5. Record prompt, diff, decision, and command result at the time of each AI session instead of reconstructing part of the evidence later.

## Conclusion

AI reduced the mechanical cost of tracing, scaffolding, and documenting a cross-cutting workflow. It did not remove the need for judgment. The quality of M3 came from enforcing the non-negotiable rules—no tier bypass, no self-approval, one final deduction, chain-preserving delegation, append-only audit, post-commit notifications, idempotent reminders, and advisory-only AI—and from testing those rules at the right evidence level.
