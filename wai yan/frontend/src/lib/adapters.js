/**
 * API → UI shape mappers (MERGE_PLAN §9).
 * Grok responses are already unwrapped by services (res.data.data).
 */

import { nameInitials, nameColor } from '../utils/nav'
import { formatRole } from '../utils/constants'

export const TYPE_LABELS = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  unpaid: 'Unpaid Leave',
  other: 'Other',
}

function dateOnly(v) {
  if (!v) return ''
  const s = String(v)
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10)
}

function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return String(iso)
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 14) return `${d}d ago`
  return dateOnly(iso)
}

/**
 * Balance from GET /api/dashboard/balance or /api/leave/balance
 * → FIGMA leaveBalance shape
 */
export function toBalance(api, aiSummaryText) {
  const row = api || {}
  const annualTotal = Number(row.annual_entitlement) || 0
  const annualRem = Number(row.annual_balance) || 0
  const annualUsed = Number(row.annual_used) != null && row.annual_used !== undefined
    ? Number(row.annual_used)
    : Math.max(0, annualTotal - annualRem)
  const sickRem = Number(row.sick_balance) || 0
  // API does not expose sick entitlement; treat remaining as available pool
  const sickTotal = Math.max(sickRem, 14)

  let aiSummary = aiSummaryText || null
  if (!aiSummary && row.ai_summary) {
    if (typeof row.ai_summary === 'string') aiSummary = row.ai_summary
    else if (row.ai_summary.summary) aiSummary = row.ai_summary.summary
    else if (Array.isArray(row.ai_summary.bullets)) aiSummary = row.ai_summary.bullets.join(' ')
  }

  return {
    annual: { total: annualTotal, used: annualUsed, remaining: annualRem },
    sick: { total: sickTotal, used: Math.max(0, sickTotal - sickRem), remaining: sickRem },
    unpaid: { total: 0, used: 0, remaining: 0 },
    carriedForward: Number(row.carried_forward) || 0,
    year: row.year,
    aiSummary:
      aiSummary ||
      `You have ${annualRem} annual leave day${annualRem === 1 ? '' : 's'} remaining` +
        (annualTotal ? ` of ${annualTotal}` : '') +
        `. Sick leave available: ${sickRem} day${sickRem === 1 ? '' : 's'}.`,
  }
}

/**
 * Leave row from GET /api/leave or approval queue items
 * → FIGMA allLeaveRequests[] item
 */
export function toLeaveRow(api, fallbackUser) {
  if (!api) return null
  const applicant = api.applicant || null
  const name =
    api.applicant_name ||
    applicant?.name ||
    fallbackUser?.name ||
    'Unknown'
  const employeeId =
    api.employee_no ||
    api.employee_id ||
    applicant?.employee_id ||
    fallbackUser?.employee_id ||
    ''
  const department =
    api.department ||
    applicant?.department ||
    fallbackUser?.department ||
    ''
  const country =
    api.country_code ||
    applicant?.country_code ||
    fallbackUser?.country_code ||
    ''

  const type = api.leave_type || api.type || 'other'

  return {
    id: api.id,
    employee: name,
    employeeId,
    avatar: nameInitials(name),
    avatarColor: nameColor(name),
    department,
    type,
    typeLabel: TYPE_LABELS[type] || type,
    start: dateOnly(api.start_date || api.start),
    end: dateOnly(api.end_date || api.end),
    days: Number(api.days_count ?? api.days) || 0,
    halfDay: Boolean(api.half_day_flag || api.halfDay),
    halfDayPeriod: api.half_day_period || null,
    status: api.status || 'pending',
    supervisorStatus: api.supervisor_status || api.supervisorStatus || null,
    managerStatus: api.manager_status || api.managerStatus || null,
    overlap: Boolean(api.overlap_flag || api.overlap),
    specialApproval: Boolean(api.special_approval_flag || api.specialApproval),
    remarks: api.remarks != null && String(api.remarks).trim() ? String(api.remarks).trim() : '',
    submittedAt: api.created_at || api.submittedAt || '',
    country,
    supervisorNote: api.supervisor_note || api.supervisorNote || null,
    managerNote: api.manager_note || api.managerNote || null,
    rejectionNote: api.rejection_note || null,
    awaitingRole: api.awaiting_role || null,
    aiSummary: api.ai_summary || null,
    raw: api,
  }
}

export function toLeaveRows(list, fallbackUser) {
  return (Array.isArray(list) ? list : []).map((r) => toLeaveRow(r, fallbackUser)).filter(Boolean)
}

/**
 * Notification from GET /api/notifications
 * → FIGMA notifications[] item
 */
export function toNotification(api) {
  if (!api) return null
  const read = api.read_flag === true || api.read === true || api.is_read === true
  return {
    id: api.id,
    type: api.type || 'submitted',
    title: api.title || 'Notification',
    message: api.body || api.message || '',
    time: relativeTime(api.created_at || api.time),
    read,
    createdAt: api.created_at || null,
    raw: api,
  }
}

export function toNotifications(list) {
  return (Array.isArray(list) ? list : []).map(toNotification).filter(Boolean)
}

/**
 * Profile from GET /api/auth/me
 * → FIGMA ROLE_CONFIGS-like shape
 */
export function toProfile(user) {
  if (!user) return null
  return {
    label: formatRole(user.role),
    user: user.name || '',
    email: user.email || '',
    employeeId: user.employee_id || '',
    jobTitle: user.job_title || '',
    department: user.department || '',
    branch: user.office_branch || '',
    country: user.country_code || '',
    countryName: user.country_name || user.office_country || '',
    phone: user.phone || '',
    address: user.personal_address || user.address || '',
    joinDate: dateOnly(user.join_date) || '',
    dob: dateOnly(user.date_of_birth) || '',
    gender: user.gender || '',
    avatar: nameInitials(user.name),
    avatarColor: nameColor(user.name),
    role: user.role,
    supervisorId: user.supervisor_id || null,
    managerId: user.manager_id || null,
    // Names not always on /me — pages may fill later
    supervisor: user.supervisor_name || null,
    manager: user.manager_name || null,
    companyName: user.company_name || '',
    companyAddress: user.company_address || '',
    id: user.id,
  }
}

/**
 * Single "who's away" person from dashboard summary / whos-away API
 * → UI row used on Dashboard (team away list)
 */
export function toAwayPerson(p) {
  if (!p) return null
  const name = p.name || p.employee_name || p.applicant_name || 'Staff'
  const type = p.leave_type || p.type || 'annual'
  return {
    employee: name,
    avatar: nameInitials(name),
    avatarColor: nameColor(name),
    type,
    typeLabel: TYPE_LABELS[type] || type,
    start: dateOnly(p.start_date || p.start),
    end: dateOnly(p.end_date || p.end || p.start_date || p.start),
    status: p.status || 'approved',
    department: p.department || '',
  }
}

export function toAwayPeople(list) {
  return (Array.isArray(list) ? list : []).map(toAwayPerson).filter(Boolean)
}

/**
 * Who's away people → calendar events by date + team member list
 */
export function toCalendarFromWhosAway(whosAway, holidays = []) {
  const people = whosAway?.people || (Array.isArray(whosAway) ? whosAway : [])
  const events = {}
  const membersMap = new Map()

  for (const p of people) {
    const name = p.name || p.employee_name || 'Staff'
    const type = p.leave_type || p.type || 'annual'
    const color = nameColor(name)
    const status = p.status || 'approved'
    const start = dateOnly(p.start_date || p.start)
    const end = dateOnly(p.end_date || p.end || start)
    if (!start) continue

    const d0 = new Date(start + 'T00:00:00')
    const d1 = new Date(end + 'T00:00:00')
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const key = dateOnly(d.toISOString())
      if (!events[key]) events[key] = []
      events[key].push({ name, type, color, status })
    }

    if (!membersMap.has(name)) {
      membersMap.set(name, {
        name,
        avatar: nameInitials(name),
        color,
        role: p.job_title || p.department || '',
        status: status === 'approved' ? 'on_leave' : 'pending_leave',
      })
    }
  }

  for (const h of holidays || []) {
    const key = dateOnly(h.date || h.holiday_date)
    if (!key) continue
    if (!events[key]) events[key] = []
    events[key].push({
      name: h.name || h.description || 'Public Holiday',
      type: 'holiday',
      color: 'var(--warning)',
      status: 'approved',
    })
  }

  return {
    calendarEvents: events,
    teamMembers: Array.from(membersMap.values()),
  }
}

/**
 * Company overview → orgStats / countryBreakdown-ish
 */
export function toOrgStats(company, summary) {
  const offices = company?.offices || []
  return {
    totalEmployees: company?.staff_count || company?.demo_users_in_system || 0,
    onLeaveToday: summary?.whos_away_this_week?.people?.length || 0,
    pendingApprovals: summary?.pending_approvals || 0,
    approvedThisMonth: summary?.my_leave_counts?.approved || 0,
    rejectedThisMonth: summary?.my_leave_counts?.rejected || 0,
    avgApprovalHours: null,
    coverageRate: null,
    companyName: company?.name || '',
    countries: (company?.countries || offices.map((o) => ({
      code: o.code,
      name: o.country || o.name,
      employees: o.approx_staff || 0,
      onLeave: 0,
      pending: 0,
    }))).map((c) => ({
      country: c.name || c.country,
      code: c.code,
      employees: c.employees ?? c.approx_staff ?? 0,
      onLeave: c.onLeave || 0,
      pending: c.pending || 0,
    })),
  }
}
