# Frontend Architecture & Structure
**Project:** HR Leave Management System  
**Member:** Wai Yan Hpone Lat (Member 3 – Backend Lead)  
**Date:** July 2026

---

## 1. Technology Stack

- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS (utility-first)
- **Routing:** React Router v7
- **HTTP Client:** Axios (with interceptors)
- **State Management:** React Context + useState/useEffect (lightweight for prototype)
- **Date Handling:** dayjs
- **Notifications (UI):** react-hot-toast or native toast
- **Calendar:** Responsive, in-app monthly approver calendar

---

## 2. Recommended Folder Structure

```
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── common/              # Shared UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── StatusBadge.jsx
│   │   ├── employee/            # Member 1 + Member 2
│   │   ├── approval/            # Member 3 focus
│   │   │   ├── ApprovalCard.jsx
│   │   │   ├── ApprovalQueue.jsx
│   │   │   └── ApprovalDetail.jsx
│   │   └── notifications/       # Member 3
│   │       ├── NotificationBell.jsx
│   │       └── NotificationList.jsx
│   ├── context/
│   │   ├── AuthContext.jsx      # Global auth state + token
│   │   └── NotificationContext.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   └── useNotifications.js
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── LeaveApplyPage.jsx   # Member 2
│   │   ├── ApprovalQueuePage.jsx # Member 3
│   │   ├── NotificationsPage.jsx # Member 3
│   │   └── AdminPage.jsx        # Member 5
│   ├── services/
│   │   ├── api.js               # Axios instance + interceptors
│   │   ├── authService.js
│   │   ├── leaveService.js
│   │   ├── approvalService.js
│   │   └── notificationService.js
│   ├── utils/
│   │   └── constants.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 3. Core Principles

- **Thin controllers / services:** All API calls live in `services/`
- **Protected routes:** Handled via `ProtectedRoute` component + `AuthContext`
- **Role-based rendering:** Use `user.role` from context to show/hide UI
- **Consistent error handling:** All services return standardized responses
- **Mobile-first:** Responsive design from the start (Tailwind)

---

## 4. Authentication Flow

1. User logs in → `authService.login()`
2. Token + user saved in `localStorage` + `AuthContext`
3. Axios interceptor automatically attaches `Authorization: Bearer <token>`
4. On 401 → auto logout + redirect to login
5. `ProtectedRoute` checks `isAuthenticated` from context

---

## 5. Integration with Backend (Member 3)

All frontend services are designed to match the backend endpoints built in Phases 0–4:

- `POST /api/auth/login`
- `GET  /api/auth/me`
- `POST /api/leave`
- `GET  /api/leave`
- `GET  /api/leave/:id`
- `POST /api/leave/:id/cancel`
- `GET  /api/leave/overlap`
- `GET  /api/approvals`
- `PUT  /api/approvals/:id/approve`
- `PUT  /api/approvals/:id/reject`
- `GET  /api/notifications`
- `PUT  /api/notifications/:id/read`
- `PUT  /api/notifications/read-all`

See `frontend-api-integration.md` for detailed request/response examples.

---

## 6. Role-Based Access (Frontend)

| Role         | Can Access                          |
|--------------|-------------------------------------|
| Employee     | Dashboard, Apply Leave, My History, Notifications |
| Supervisor   | + Approval Queue                    |
| Manager      | + Approval Queue                    |
| HR Admin     | + Admin Panel, All Approvals        |

This is enforced both on backend (RBAC middleware) and frontend (conditional rendering + protected routes).

---

## 7. Next Steps for Frontend Team

- Member 1: Build shared layout + protected routing + Login/Dashboard
- Member 2: Build Leave Apply form + History + Status tracker
- Member 3: Build Approval Queue + Notification center (already prepared in services)
- Member 4 & 5: Calendar, Overlap warnings, HR Admin panel

---

*This document serves as the frontend architecture reference for the team and for individual submission.*