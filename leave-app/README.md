# Leave Management System (leave-app)

Innovare Management Singapore - SCCCI AI Challenge Problem 2B (Group 4).
Project structured following the lab5 learning-app conventions.

```
leave-app/
├── server/                  Express + Sequelize (MySQL) API
│   ├── index.js             entry point (CORS, routes, sequelize.sync)
│   ├── seed.js              demo data: npm run seed
│   ├── middlewares/auth.js  validateToken (JWT) + requireRole (RBAC)
│   ├── models/              User, LeaveRequest, LeaveBalance, PublicHoliday,
│   │                        AuditLog, Notification, AiInteraction
│   ├── routes/              user, leaveRequest, publicHoliday, ai
│   └── services/            coverage.js (AI-2 engine), ai.js (AI-1 LLM+fallback)
└── client/                  Vite + React + Tailwind
    └── src/
        ├── App.jsx          session restore + role-based routing
        ├── lib/http.js      axios with JWT interceptor
        └── pages/           Login, Employee (UC-01/08/09), Approver (UC-02 + AI-3)
```

## Run order
1. MySQL: `CREATE DATABASE leave;`
2. `cd server && npm install && cp .env.example .env` (edit credentials + APP_SECRET)
3. `npm run seed` then `npm run dev`  (API on :3001)
4. `cd ../client && npm install && cp .env.example .env`
5. `npm run dev`  (app on :3000)

## Demo accounts (password: demo123!)
weiling@ / priya@ / kumar@ / faridah@innovare.com (EMPLOYEE),
marcus@innovare.com (SUPERVISOR), diana@innovare.com (MANAGER)

## End-to-end demo
Login weiling → apply (try the AI-1 chips; pick 20-24 Jul for the AI-2 warning)
→ logout → marcus: AI-3 card, approve → logout → diana: final approve
→ login weiling: Approved, balance deducted, calendar updated.

Optional: set ANTHROPIC_API_KEY in server/.env to use the hosted LLM for AI-1
(otherwise a built-in heuristic parser keeps the demo fully offline).
