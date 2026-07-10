# AI Reflection (short version, ~450–500 words)

**Name:** Wai Yan Hpone Lat  
**Role:** Member 3 – Backend Lead (Workflow & Notifications)

I used AI assistants throughout design, implementation, testing, debugging, and documentation for the leave approval workflow—not only to generate code. In design, AI helped map HLD use cases to REST endpoints and a two-tier state machine. In coding, it scaffolded Express layers (routes, controllers, services) and React pages for the approval queue and notifications. In testing, it suggested edge cases and automated scripts. I always treated AI as a pair programmer: short iterative prompts, then verification with a running server and real logins (employee → supervisor → manager).

AI helped most with structure and speed: consistent JSON envelopes, database transactions around approve/reject, notification fan-out, and an AI-3 summary card for approvers. It also helped reason about cancellation—when balance should restore versus when a pending request can cancel immediately.

Critical use of AI mattered more than generation speed. I rejected several suggestions that would have hurt the grade or product. Auto-approval after 24 hours was rejected because the specification allows reminders only. Allowing a manager to approve before the supervisor was rejected because the supervisor cannot be bypassed. Putting personal details in email or WhatsApp bodies was rejected for security. Inventing endpoints outside the API documentation was rejected so delivery stayed spec-driven. For AI-3, I modified a pure-LLM design to include a rule-engine fallback so demos still work without a network key, and I kept `decision_required: true` so humans always decide.

My prompting was iterative, not one-shot: first approvals with audit logging; then cancel and balance rules; then notifications and non-auto reminders; then AI assist and automated checks that prove bypass is impossible. Each step was tested before the next feature.

I learned to put non-negotiables in the prompt (audit log, exact error codes, no auto-approve), to test immediately, and to prefer small reviews over regenerating whole files. AI accelerates breadth; humans own policy, security, and rubric alignment. Limitations included AI choosing leave years without seeded balances and early dual-process database issues, which I fixed by aligning tests to seed data and using SQLite for stable local demos.

In conclusion, AI improved my productivity, but Grade A quality came from critical review against the HLD, enforcing two-tier workflow and RBAC, writing audit trails, and proving behaviour with tests and a clear demo—not from unreviewed AI output.
