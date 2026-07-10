# Enhancement Spec — HR Leave Management System (Phase 7+)

**Context:** Backend Phases 0–5 are built and working against the original specs.
This document adds features ON TOP of the existing codebase. Do not break existing endpoints — extend them.

---

## ENH-1: Real Company Profile & Extended User Fields

**Problem:** The current `users` table is minimal. A real company needs richer employee profiles.

**Company:** Apex-style organisation. Singapore HQ, ~60 staff across 10 Asian offices:
China, Indonesia, Japan, Malaysia, Myanmar, New Zealand, Philippines, Singapore, Thailand, Vietnam.

**New columns on `users` table (migration, not recreate):**

```sql
ALTER TABLE users
  ADD COLUMN employee_id    VARCHAR(20)  UNIQUE,        -- e.g. APEX-SG-0042
  ADD COLUMN phone          VARCHAR(20),
  ADD COLUMN address         TEXT,
  ADD COLUMN office_branch   VARCHAR(100),               -- e.g. "Singapore HQ", "Myanmar Office"
  ADD COLUMN company_address TEXT,                       -- office address for that branch
  ADD COLUMN job_title       VARCHAR(100),
  ADD COLUMN date_of_birth   DATE,
  ADD COLUMN join_date       DATE,
  ADD COLUMN gender          VARCHAR(10)  CHECK (gender IN ('male','female','other','prefer_not_to_say'));
```

**API changes:**
- `GET /api/auth/me` and login response: include all new fields in the `user` object.
- `GET /api/leave/:id` applicant object: include `employee_id`, `job_title`, `office_branch`.
- New endpoint: `PUT /api/users/profile` — authenticated user can update their own
  phone, address (not employee_id or role — those are admin-only).

**Seed data:** Update seed to include realistic Apex-style employee IDs, office branches across
at least SG, TH, and MM, job titles (e.g. "Finance Executive", "HR Manager"), and phone numbers.

---

## ENH-2: Multi-Country Office Support

**10 country codes:** CN, ID, JP, MY, MM, NZ, PH, SG, TH, VN

**Changes:**
- `leave_policies` table: seed rows for ALL 10 countries (use reasonable regional defaults
  where the HLD doesn't specify — e.g. JP: 10–20 annual, 10 sick; NZ: 20 annual, 5 sick).
- `users.country_code`: expand seed data to cover at least 5 of the 10 countries.
- `public_holidays`: load for all 10 countries (see ENH-3).
- `office_branch` on user profile maps to a country — the system uses `country_code` for
  policy/holiday logic, `office_branch` for display.

---

## ENH-3: Public Holidays 2025–2035 with Smart Loading

**Requirement:** Public holidays for 10 countries, years 2025–2035. When a user searches
or applies for leave in year 2030+, auto-extend to the next 10 years.

**Implementation approach:**

1. **Seed 2025–2028** for all 10 countries from known data (static insert in seed script).
2. **On-demand API fetch for future years:**
   - New backend service: `holidayService.js`
   - When `policyEngine.calcDaysCount` is called for a year that has NO `public_holidays`
     rows for that country+year, call an external holidays API
     (e.g. Nager.Date `https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}`,
     or Calendarific, or AbstractAPI — pick whichever is free).
   - Insert the fetched holidays into `public_holidays` table (cache forever — holidays
     don't change retroactively).
   - If the API call fails, log a warning and continue with 0 holidays for that range
     (graceful degradation).
3. **Bulk pre-load endpoint (HR Admin only):**
   `POST /api/admin/holidays/load` `{ country_code, year_from, year_to }`
   Fetches and caches holidays for a range.

**No year limit hardcoded** — the system grows as users need it.

---

## ENH-4: AI-Powered Balance Summary (OpenRouter)

**New service:** `backend/src/services/aiService.js`

```js
async function summarizeLeaveBalance(userBalance, userName) {
  // userBalance = { annual_balance, carried_forward, annual_entitlement, sick_balance }
  // Returns: short friendly professional summary (2–3 sentences)
  // Model: OpenRouter (e.g. meta-llama/llama-3-8b-instruct or similar free tier)
  // temperature: 0.3, max_tokens: 100
  // Fallback on ANY error: "Unable to generate balance summary at the moment."
}
```

**Integration points:**
- `GET /api/leave/balance` (new endpoint): returns raw balance data + `ai_summary` field.
- Frontend dashboard shows the AI summary as a friendly card above the balance numbers.
- `.env`: `OPENROUTER_API_KEY=...`, `OPENROUTER_MODEL=meta-llama/llama-3-8b-instruct`

**Important:** This is a nice-to-have. If no API key is configured, skip the AI call and
return `ai_summary: null`. Never block the balance response waiting for AI.

---

## ENH-5: Apply Leave — Editable Applicant Fields

**Problem:** When applying for leave, the form should pre-fill the applicant's details
(employee_id, name, job_title, department, office_branch) from their profile, but these
fields should NOT be locked/read-only.

**Why:** Employee details aren't always constant — secondments, transfers, name changes.
The form should suggest from the staff database but allow the user to override.

**Implementation:**
- Frontend: pre-fill fields from `AuthContext.user`, but render them as editable inputs.
- Backend `POST /api/leave`: accept optional `applicant_name_override`, `applicant_department_override`
  in the request body. Store in `leave_requests` if provided (new nullable columns), otherwise
  fall back to the `users` table data at query time.
- Display: `GET /api/leave/:id` returns the override if set, else the user's current profile data.

---

## ENH-6: Responsive UI/UX — All Devices

**Requirement:** The frontend MUST be fully responsive across:
- Phones (320px–480px)
- Tablets/iPads (768px–1024px)
- Laptops (1024px–1440px)
- Desktop monitors: 24" (1920px), 27" (2560px), 32"+ (3840px / 4K)

**Implementation rules:**
- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) on every layout component.
- Navbar: hamburger menu on mobile, full horizontal on desktop.
- Sidebar: collapsible drawer on mobile, persistent on lg+.
- Tables (leave history, approval queue): stack as cards on mobile, table on md+.
- Forms: single column on mobile, two-column grid on lg+.
- Dashboard cards: 1-col mobile → 2-col tablet → 3/4-col desktop.
- Touch targets: minimum 44px height on all buttons and interactive elements.
- Test at 375px (iPhone SE), 768px (iPad), 1440px (laptop), and 1920px (desktop) breakpoints.
- Max content width: `max-w-7xl mx-auto` — don't stretch to fill a 40" monitor edge-to-edge.

---

## ENH-7: Additional Appropriate Features

### 7a. Leave Balance Dashboard with Charts
- Pie/donut chart showing used vs remaining for each leave type.
- Year-over-year comparison if data exists.

### 7b. Team Calendar View (Read-Only)
- Supervisor/Manager sees a monthly calendar with team leave blocks.
- Color-coded by status (pending = yellow, approved = green).
- Uses the existing `GET /api/leave/overlap` data.

### 7c. Export Leave History
- Employee can download their leave history as CSV or PDF.
- HR Admin can export all leave data for a department or country.

### 7d. Password Change
- `PUT /api/auth/password` `{ current_password, new_password }`
- Minimum 8 chars, at least one uppercase + one number.

### 7e. Dark Mode
- Tailwind `dark:` classes. Toggle in navbar. Persist preference in localStorage.

### 7f. Audit Log Viewer (HR Admin Only)
- `GET /api/admin/audit-log?entity_type=leave_request&entity_id=42`
- Shows the full before/after JSONB trail in a timeline UI.

---

## Database Migration Strategy

Do NOT drop and recreate tables. Use ALTER TABLE statements so existing seed data and
test records survive. Create a `backend/src/db/migrations/` folder:
- `001_add_user_profile_fields.sql`
- `002_add_leave_overrides.sql`
- `003_seed_multi_country.sql`

Run migrations after the existing seed, or make them idempotent.

---

## Priority Order for Implementation

| Priority | Enhancement | Effort | Why |
|----------|------------|--------|-----|
| 1        | ENH-1 (user profiles) | Medium | Foundation for everything else |
| 2        | ENH-2 (multi-country) | Low | Just seed data + policies |
| 3        | ENH-6 (responsive UI) | Medium | Grading requirement for UX |
| 4        | ENH-3 (holidays API) | Medium | Impressive for demo |
| 5        | ENH-4 (AI summary) | Low | Quick win, shows AI integration |
| 6        | ENH-5 (editable fields) | Low | Small frontend + backend change |
| 7        | ENH-7a–f (extras) | Varies | Pick based on time remaining |

---

*This document extends the original specs (database-schema.md, api-documentation.md, use-cases.md).
The original docs remain the source of truth for the core workflow. This file adds enhancements only.*
