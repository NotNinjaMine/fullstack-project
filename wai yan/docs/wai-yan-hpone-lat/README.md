# Individual Submission — Wai Yan Hpone Lat (Member 3)

**Role:** Backend Lead – Workflow & Notifications  
**Project:** HR Leave Management System (SCCCI AI Challenge)  
**Date:** July 2026  

## Contents

| File | Purpose |
|------|---------|
| `use-cases.md` | UC-02, UC-08, UC-12, UC-15, UC-16 + AI-3 (edge cases) |
| `api-documentation.md` | All owned endpoints, envelopes, RBAC, errors |
| `database-schema.md` | leave_requests state machine, audit, notifications |
| `../demo-script-member3.md` | Live demo script for Final Review |
| `../../ai/wai-yan-hpone-lat/` | AI logs + reflection (Section C) |

## Owned surface (summary)

- **UC-02** Two-tier approval (supervisor → manager)
- **UC-12** In-app + email (+ WhatsApp hooks) notifications
- **UC-08** Approver calendar & history
- **UC-15** Approval delegation
- **UC-16** Bulk approve/reject
- **AI-3** Approval assistant summary card

## How to run (for markers)

```bash
cd backend
npm install
npm run seed
npm run test          # unit/integration tests
npm run grade         # live API grade checks (server must be up)
npm run dev           # http://localhost:3001

cd ../frontend
npm install
npm run dev           # http://localhost:5173
```

**Demo logins** (password `Password123!`):

| Email | Role |
|-------|------|
| alice.tan@company.com | employee |
| bob.supervisor@company.com | supervisor |
| carol.manager@company.com | manager |
| hr.admin@company.com | hr_admin |
