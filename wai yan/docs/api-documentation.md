# API Documentation – Wai Yan Hpone Lat (Member 3)

**Role:** Backend Lead – Workflow & Notifications  
**Owned Endpoints:** Auth, Leave Requests, Approvals, Notifications  
**Base URL:** `/api`  
**Authentication:** `Authorization: Bearer <JWT>` (except `/api/auth/login`)  
**Standard Response Envelope:**

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable description"
}
```

**Date:** July 2026

---

## 1. Authentication Endpoints

### POST /api/auth/login
**Roles:** Public  
**Description:** Authenticates user and returns JWT + user profile.

**Request Body:**
```json
{
  "email": "alice.tan@company.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Alice Tan",
      "email": "alice.tan@company.com",
      "role": "employee",
      "country_code": "SG",
      "department": "Finance",
      "supervisor_id": 5,
      "manager_id": 8,
      "hod_id": 12
    }
  }
}
```

**Error Responses:**
- `400 VALIDATION_ERROR`
- `401 INVALID_CREDENTIALS`

---

### GET /api/auth/me
**Roles:** All authenticated users  
**Description:** Returns current authenticated user profile (from JWT).

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Alice Tan",
    "email": "alice.tan@company.com",
    "role": "employee",
    "country_code": "SG",
    "department": "Finance",
    "supervisor_id": 5,
    "manager_id": 8,
    "hod_id": 12,
    "active": true
  }
}
```

**Error Responses:**
- `401 UNAUTHORISED`

---

## 2. Leave Request Endpoints

### GET /api/leave
**Roles:** All authenticated (returns only own requests)  
**Query Params:** `?status=pending`, `?year=2026`, `?leave_type=annual`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "leave_type": "annual",
      "start_date": "2026-07-14",
      "end_date": "2026-07-16",
      "half_day_flag": false,
      "half_day_period": null,
      "status": "pending",
      "supervisor_status": "pending",
      "manager_status": "pending",
      "special_approval_flag": false,
      "overlap_flag": false,
      "days_count": 3,
      "created_at": "2026-06-01T10:00:00Z"
    }
  ]
}
```

---

### POST /api/leave
**Roles:** All authenticated (employees apply for themselves)  
**Description:** Submit a new leave request. Triggers overlap check and notifications.

**Request Body:**
```json
{
  "leave_type": "annual",
  "start_date": "2026-07-14",
  "end_date": "2026-07-16",
  "half_day_flag": false,
  "half_day_period": null,
  "remarks": "Family trip to Malaysia"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "status": "pending",
    "overlap_flag": false,
    "special_approval_flag": false,
    "days_count": 3
  }
}
```

**Error Responses:**
- `400 VALIDATION_ERROR`
- `400 INSUFFICIENT_BALANCE`
- `400 INVALID_DATE_RANGE`

---

### GET /api/leave/:id
**Roles:** Owner, Supervisor (direct reports), Manager, HOD, HR Admin

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "applicant": {
      "id": 1,
      "name": "Alice Tan",
      "country_code": "SG"
    },
    "leave_type": "annual",
    "start_date": "2026-07-14",
    "end_date": "2026-07-16",
    "half_day_flag": false,
    "half_day_period": null,
    "remarks": "Family trip",
    "status": "pending",
    "supervisor_status": "pending",
    "supervisor_note": null,
    "manager_status": "pending",
    "manager_note": null,
    "special_approval_flag": false,
    "overlap_flag": false,
    "days_count": 3,
    "created_at": "2026-06-01T10:00:00Z",
    "updated_at": "2026-06-01T10:00:00Z"
  }
}
```

**Error Responses:**
- `403 FORBIDDEN`
- `404 NOT_FOUND`

---

### POST /api/leave/:id/cancel
**Roles:** Owner only

**Request Body:**
```json
{
  "reason": "Plans changed due to project deadline"
}
```

**Success Response (200) – Pending request:**
```json
{
  "success": true,
  "data": { "id": 42, "status": "cancelled" }
}
```

**Success Response (200) – Approved request (enters cancel workflow):**
```json
{
  "success": true,
  "data": { "id": 42, "status": "cancel_pending" }
}
```

**Error Responses:**
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 ALREADY_CANCELLED`

---

### GET /api/leave/overlap
**Roles:** All authenticated  
**Query Params:** `?start_date=2026-07-14&end_date=2026-07-16` (required)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "has_overlap": true,
    "overlapping_members": [
      {
        "user_id": 3,
        "name": "Bob Lim",
        "leave_type": "annual",
        "start_date": "2026-07-14",
        "end_date": "2026-07-15"
      }
    ]
  }
}
```

**Error Responses:**
- `400 MISSING_DATE_PARAMS`

---

## 3. Approval Endpoints

### GET /api/approvals
**Roles:** Supervisor, Manager, HR Admin  
**Query Params:** `?status=pending`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "applicant": {
        "id": 1,
        "name": "Alice Tan",
        "country_code": "SG",
        "department": "Finance"
      },
      "leave_type": "annual",
      "start_date": "2026-07-14",
      "end_date": "2026-07-16",
      "days_count": 3,
      "overlap_flag": false,
      "special_approval_flag": false,
      "awaiting_role": "supervisor",
      "team_on_leave_count": 1,
      "created_at": "2026-06-01T10:00:00Z"
    }
  ]
}
```

---

### PUT /api/approvals/:id/approve
**Roles:** Supervisor (step 1), Manager (step 2)

**Request Body:**
```json
{
  "note": "Coverage confirmed. Approved."
}
```

**Success Response (200) – Supervisor approves:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "supervisor_status": "approved",
    "manager_status": "pending",
    "status": "supervisor_approved"
  }
}
```

**Success Response (200) – Manager final approval:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "manager_status": "approved",
    "status": "approved",
    "balance_deducted": 3.0
  }
}
```

**Error Responses:**
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 ALREADY_ACTIONED`

---

### PUT /api/approvals/:id/reject
**Roles:** Supervisor, Manager

**Request Body:**
```json
{
  "note": "Insufficient coverage during this period."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": { "id": 42, "status": "rejected" }
}
```

**Error Responses:**
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 ALREADY_ACTIONED`

---

## 4. Notification Endpoints

### GET /api/notifications
**Roles:** All authenticated

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "type": "approved",
      "message": "Your annual leave (14–16 Jul 2026) has been approved.",
      "read_flag": false,
      "leave_request_id": 42,
      "created_at": "2026-06-02T09:00:00Z"
    }
  ]
}
```

---

### PUT /api/notifications/:id/read
**Roles:** Owner only

**Success Response (200):**
```json
{
  "success": true,
  "data": { "id": 10, "read_flag": true }
}
```

---

### PUT /api/notifications/read-all
**Roles:** All authenticated

**Success Response (200):**
```json
{
  "success": true,
  "data": { "updated_count": 5 }
}
```

---

## 5. Error Codes Used Across My Endpoints

| Code                        | HTTP Status | Meaning                                      |
|----------------------------|-------------|----------------------------------------------|
| VALIDATION_ERROR           | 400         | Request body failed validation               |
| INSUFFICIENT_BALANCE       | 400         | Not enough leave balance                     |
| INVALID_DATE_RANGE         | 400         | End date before start or invalid half-day    |
| MISSING_DATE_PARAMS        | 400         | Required query params missing                |
| UNAUTHORISED               | 401         | Missing or invalid JWT                       |
| FORBIDDEN                  | 403         | Role does not have permission                |
| NOT_FOUND                  | 404         | Resource does not exist                      |
| ALREADY_ACTIONED           | 409         | Request already approved/rejected            |
| ALREADY_CANCELLED          | 409         | Request already cancelled                    |
| YEAR_ALREADY_PROCESSED     | 400         | Carry-forward already run for the year       |

---

## 6. RBAC Summary for My Endpoints

| Endpoint                          | Employee | Supervisor | Manager | HOD | HR Admin |
|-----------------------------------|----------|------------|---------|-----|----------|
| POST /api/leave                   | ✅       | ✅         | ✅      | ✅  | ✅       |
| GET /api/leave (own)              | ✅       | ✅         | ✅      | ✅  | ✅       |
| GET /api/leave/:id                | Own only | Direct reports | All groups | All | All     |
| POST /api/leave/:id/cancel        | Own only | Own only   | Own only| Own | ✅       |
| GET /api/approvals                | ❌       | Direct reports | All groups | ❌  | ✅       |
| PUT /api/approvals/:id/approve    | ❌       | ✅ (Step 1)| ✅ (Step 2) | ❌ | ❌     |
| PUT /api/approvals/:id/reject     | ❌       | ✅         | ✅      | ❌  | ❌       |
| GET /api/notifications            | ✅       | ✅         | ✅      | ✅  | ✅       |
| PUT /api/notifications/*          | Own only | Own only   | Own only| Own | Own only |

---

*This document covers all endpoints I am responsible for implementing as Backend Lead – Workflow & Notifications.*  
*All specifications are taken directly from the official High-Level Design (HLD) document.*