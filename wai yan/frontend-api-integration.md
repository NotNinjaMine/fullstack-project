# Frontend API Integration Guide
**Backend Owner:** Wai Yan Hpone Lat (Member 3)  
**Date:** July 2026

This document shows exactly how the frontend should call the backend APIs built in Phases 0–4.

---

## 1. Base Configuration

**Base URL:** `import.meta.env.VITE_API_URL` (e.g. `http://localhost:3001`)

**Axios Instance** (`src/services/api.js`):

```js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## 2. Authentication

### Login

```js
// services/authService.js
export const login = async (email, password) => {
  const res = await api.post('/api/auth/login', { email, password });
  const { token, user } = res.data.data;
  localStorage.setItem('accessToken', token);
  return user;
};

export const getCurrentUser = async () => {
  const res = await api.get('/api/auth/me');
  return res.data.data;
};
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "token": "...",
    "user": { "id": 1, "name": "Alice Tan", "role": "employee", ... }
  }
}
```

---

## 3. Leave Requests (UC-01, UC-03)

### Apply for Leave

```js
export const applyLeave = async (leaveData) => {
  const res = await api.post('/api/leave', leaveData);
  return res.data.data;
};
```

**Request Body Example:**
```json
{
  "leave_type": "annual",
  "start_date": "2026-08-10",
  "end_date": "2026-08-12",
  "half_day_flag": false,
  "remarks": "Team building"
}
```

### Get My Leave Requests

```js
export const getMyLeaves = async (params = {}) => {
  const res = await api.get('/api/leave', { params });
  return res.data.data;
};
```

### Cancel Leave

```js
export const cancelLeave = async (id, reason) => {
  const res = await api.post(`/api/leave/${id}/cancel`, { reason });
  return res.data.data;
};
```

---

## 4. Approval Workflow (UC-02) – Member 3 Core

### Get Pending Approvals

```js
export const getPendingApprovals = async () => {
  const res = await api.get('/api/approvals');
  return res.data.data;
};
```

**Only accessible to:** `supervisor`, `manager`, `hr_admin`

### Approve Request

```js
export const approveRequest = async (id, note = '') => {
  const res = await api.put(`/api/approvals/${id}/approve`, { note });
  return res.data.data;
};
```

### Reject Request

```js
export const rejectRequest = async (id, note) => {
  const res = await api.put(`/api/approvals/${id}/reject`, { note });
  return res.data.data;
};
```

**Important:** Rejection requires a `note`.

---

## 5. Notifications (UC-12) – Member 3

### Get Notifications

```js
export const getNotifications = async (unreadOnly = false) => {
  const params = unreadOnly ? { unread: 'true' } : {};
  const res = await api.get('/api/notifications', { params });
  return res.data.data;
};
```

### Mark as Read

```js
export const markNotificationRead = async (id) => {
  const res = await api.put(`/api/notifications/${id}/read`);
  return res.data.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.put('/api/notifications/read-all');
  return res.data.data;
};
```

---

## 6. Error Handling Pattern (Recommended)

```js
try {
  const data = await someService();
} catch (err) {
  const message = err.response?.data?.message || 'Something went wrong';
  const code = err.response?.data?.code;
  toast.error(message);
  
  if (code === 'UNAUTHORISED') {
    // redirect to login
  }
}
```

---

## 7. Environment Variables

**`.env.example`**
```
VITE_API_URL=http://localhost:3001
```

**Production:**
```
VITE_API_URL=https://your-backend.onrender.com
```

---

## 8. Summary Table

| Frontend Action              | Backend Endpoint                      | Method | Auth Required | Roles Allowed          |
|-----------------------------|---------------------------------------|--------|---------------|------------------------|
| Login                       | `/api/auth/login`                     | POST   | No            | Public                 |
| Get Profile                 | `/api/auth/me`                        | GET    | Yes           | All                    |
| Apply Leave                 | `/api/leave`                          | POST   | Yes           | All                    |
| My Leave History            | `/api/leave`                          | GET    | Yes           | All                    |
| Cancel Leave                | `/api/leave/:id/cancel`               | POST   | Yes           | Owner / HR Admin       |
| Check Overlap               | `/api/leave/overlap`                  | GET    | Yes           | All                    |
| Get Approvals               | `/api/approvals`                      | GET    | Yes           | Supervisor, Manager, HR|
| Approve Request             | `/api/approvals/:id/approve`          | PUT    | Yes           | Supervisor, Manager    |
| Reject Request              | `/api/approvals/:id/reject`           | PUT    | Yes           | Supervisor, Manager    |
| Get Notifications           | `/api/notifications`                  | GET    | Yes           | All                    |
| Mark Notification Read      | `/api/notifications/:id/read`         | PUT    | Yes           | Owner                  |


## 9. Enhancement Endpoints

### Update contact details

```js
export const updateProfile = async ({ phone, address }) => {
  const res = await api.put('/api/users/profile', { phone, address });
  return res.data.data;
};
```

Only `phone` and `address` are self-service. Employee ID, role, department, office, and leave country are HR-managed.

### Balance with optional AI summary

```js
const res = await api.get('/api/leave/balance');
// { ...balance, ai_summary: string | null }
```

When no AI provider is configured, `ai_summary` is `null` and the balance response remains available.

### HR holiday cache loader

```js
await api.post('/api/admin/holidays/load', {
  country_code: 'SG',
  year_from: 2030,
  year_to: 2040,
});
```

This endpoint is restricted to `hr_admin`. Holiday searches and applications for 2030 onward also begin a background prefetch of the following 10 years.


---

*This guide is aligned with the current frontend and backend implementation.*