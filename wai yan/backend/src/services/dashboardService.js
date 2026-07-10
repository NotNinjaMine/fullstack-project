/**
 * Dashboard aggregates: balances, who's away, manager command center.
 */

const db = require('../config/db');
const { getBalance } = require('./policyEngine');
const { getActingForUserIds } = require('./delegationService');
const { toDateOnly } = require('../utils/dates');
const { appError } = require('../middleware/errorHandler');
const {
  COUNTRY_LABELS,
  SUPPORTED_COUNTRY_CODES,
} = require('../config/company');
const holidayService = require('./holidayService');
const companyAdminService = require('./companyAdminService');

function mapBalance(row, year) {
  if (!row) {
    return {
      year,
      annual_entitlement: 0,
      annual_balance: 0,
      sick_balance: 0,
      carried_forward: 0,
      annual_used: 0,
      annual_pct_remaining: 0,
    };
  }
  const entitlement = Number(row.annual_entitlement) || 0;
  const annual = Number(row.annual_balance) || 0;
  const used = Math.max(0, entitlement - annual);
  return {
    year: row.year,
    annual_entitlement: entitlement,
    annual_balance: annual,
    sick_balance: Number(row.sick_balance) || 0,
    carried_forward: Number(row.carried_forward) || 0,
    annual_used: used,
    annual_pct_remaining:
      entitlement > 0 ? Math.round((annual / entitlement) * 100) : 0,
  };
}

async function getMyBalance(user, year = new Date().getFullYear()) {
  const row = await getBalance(user.id, year);
  return mapBalance(row, year);
}

/**
 * People on leave overlapping [start, end] in the viewer's scope.
 */
async function getWhosAway(user, { start_date, end_date } = {}) {
  const start = start_date || toDateOnly(new Date());
  const end =
    end_date ||
    toDateOnly(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const actingIds = await getActingForUserIds(user.id);
  const params = [start, end];
  let scopeSql = '';

  if (user.role === 'hr_admin' || user.role === 'hod') {
    scopeSql = 'TRUE';
  } else if (
    ['supervisor', 'manager'].includes(user.role) ||
    actingIds.length > 1
  ) {
    // Reporting line and/or same department
    actingIds.forEach((id) => params.push(id));
    const ph = actingIds.map((_, i) => `$${i + 3}`).join(',');
    if (user.department) {
      params.push(user.department);
      scopeSql = `(lr.supervisor_id IN (${ph}) OR lr.manager_id IN (${ph}) OR u.department = $${params.length})`;
    } else {
      scopeSql = `(lr.supervisor_id IN (${ph}) OR lr.manager_id IN (${ph}))`;
    }
  } else if (user.department) {
    params.push(user.department);
    scopeSql = `u.department = $3`;
  } else {
    params.push(user.id);
    scopeSql = `lr.user_id = $3`;
  }

  const result = await db.query(
    `SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
            lr.days_count, lr.half_day_flag, lr.overlap_flag,
            u.id AS user_id, u.name, u.department, u.country_code
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE lr.status IN ('pending', 'supervisor_approved', 'approved', 'cancel_pending')
       AND lr.start_date <= $2
       AND lr.end_date >= $1
       AND ${scopeSql}
     ORDER BY lr.start_date ASC
     LIMIT 100`,
    params
  );

  return {
    start_date: start,
    end_date: end,
    people: result.rows.map((r) => ({
      leave_id: r.id,
      user_id: r.user_id,
      name: r.name,
      department: r.department,
      country_code: r.country_code,
      leave_type: r.leave_type,
      start_date: toDateOnly(r.start_date),
      end_date: toDateOnly(r.end_date),
      status: r.status,
      days_count: Number(r.days_count),
      half_day_flag: Boolean(r.half_day_flag),
      overlap_flag: Boolean(r.overlap_flag),
    })),
  };
}

/**
 * Public holidays for calendar search.
 * DB cache first; online Nager.Date only if year+country not yet cached.
 * Always returns { holidays, meta }.
 */
async function getPublicHolidays(user, { year, country_code } = {}) {
  return holidayService.listHolidays({ year, country_code });
}

/**
 * Company profile: name, ~60 staff, 10 countries/offices, PH counts.
 */
async function getCompanyInfo(user, { year } = {}) {
  const profile = await companyAdminService.getLiveCompanyProfile();
  const y = Number(year) || new Date().getFullYear();
  // Ensure PH for the requested year exist (search-driven cache)
  await holidayService.ensureYear(y);

  const ph = await db.query(
    `SELECT country_code, COUNT(*)::int AS c
     FROM public_holidays
     WHERE holiday_date >= $1 AND holiday_date <= $2
     GROUP BY country_code
     ORDER BY country_code`,
    [`${y}-01-01`, `${y}-12-31`]
  );
  const holidayCountByCountry = {};
  let totalHolidays = 0;
  ph.rows.forEach((r) => {
    holidayCountByCountry[r.country_code] = Number(r.c);
    totalHolidays += Number(r.c);
  });

  const staffInDb = await db.query(
    `SELECT COUNT(*)::int AS c FROM users WHERE active IS NOT NULL`
  );
  const demo_users_in_system = Number(staffInDb.rows[0]?.c) || 0;

  const officeCodes = (profile.offices || []).map((o) => o.code);
  const supported =
    officeCodes.length > 0 ? officeCodes : SUPPORTED_COUNTRY_CODES;

  return {
    name: profile.name,
    short_name: profile.short_name,
    reg_no: profile.reg_no,
    hq_country: profile.hq_country,
    hq_country_code: profile.hq_country_code,
    hq_address: profile.hq_address,
    staff_count: profile.staff_count,
    total_countries: profile.total_countries,
    total_offices: profile.total_offices,
    industry: profile.industry,
    description: profile.description,
    website: profile.website,
    timezone_primary: profile.timezone_primary,
    countries: profile.countries,
    updated_at: profile.updated_at,
    can_edit: user?.role === 'hr_admin',
    offices: (profile.offices || []).map((o) => ({
      ...o,
      public_holidays_this_year: holidayCountByCountry[o.code] || 0,
    })),
    public_holidays: {
      year: y,
      total: totalHolidays,
      by_country: holidayCountByCountry,
      supported_country_codes: supported,
    },
    demo_users_in_system,
  };
}

/** HR: update company-level fields */
async function updateCompanyProfile(user, body) {
  return companyAdminService.updateCompanyProfile(user, body);
}

/** HR: upsert one office */
async function upsertCompanyOffice(user, body) {
  return companyAdminService.upsertOffice(user, body);
}

/** HR: delete office */
async function deleteCompanyOffice(user, code) {
  return companyAdminService.deleteOffice(user, code);
}

/** HR: bulk replace offices */
async function replaceCompanyOffices(user, offices) {
  return companyAdminService.replaceAllOffices(user, offices);
}

/**
 * Full dashboard payload for home page.
 */
async function getSummary(user) {
  const year = new Date().getFullYear();
  const balance = await getMyBalance(user, year);

  const myLeaves = await db.query(
    `SELECT status, COUNT(*)::int AS c FROM leave_requests
     WHERE user_id = $1 GROUP BY status`,
    [user.id]
  );
  const byStatus = {};
  myLeaves.rows.forEach((r) => {
    byStatus[r.status] = Number(r.c);
  });

  const weekStart = toDateOnly(new Date());
  const weekEnd = toDateOnly(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const away = await getWhosAway(user, {
    start_date: weekStart,
    end_date: weekEnd,
  });

  // Pending approvals — use queue list (rules-based AI, no LLM storm)
  let pendingApprovals = 0;
  let highRiskPending = 0;
  try {
    const approvalService = require('./approvalService');
    const queue = await approvalService.listPendingForApprover(user);
    pendingApprovals = queue.length;
    highRiskPending = queue.filter(
      (q) =>
        q.ai_summary?.risk_level === 'high' ||
        q.special_approval_flag ||
        q.overlap_flag
    ).length;
  } catch {
    // non-approvers get empty queue
  }

  const unread = await db.query(
    `SELECT COUNT(*)::int AS c FROM notifications
     WHERE user_id = $1 AND read_flag = FALSE`,
    [user.id]
  );

  const company = await getCompanyInfo(user, { year });

  return {
    balance,
    my_leave_counts: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      pending: (byStatus.pending || 0) + (byStatus.supervisor_approved || 0),
      approved: byStatus.approved || 0,
      rejected: byStatus.rejected || 0,
      cancelled: byStatus.cancelled || 0,
      cancel_pending: byStatus.cancel_pending || 0,
      by_status: byStatus,
    },
    unread_notifications: Number(unread.rows[0]?.c || 0),
    pending_approvals: pendingApprovals,
    high_risk_pending: highRiskPending,
    whos_away_this_week: away,
    company: {
      name: company.name,
      staff_count: company.staff_count,
      total_countries: company.total_countries,
      total_offices: company.total_offices,
      hq_country: company.hq_country,
      hq_address: company.hq_address,
      public_holidays_total: company.public_holidays.total,
      countries: company.countries,
    },
  };
}

function toCsv(rows, columns) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')
  );
  return [header, ...lines].join('\n');
}

async function exportMyLeaveCsv(user, { year } = {}) {
  const params = [user.id];
  let yearClause = '';
  if (year) {
    params.push(Number(year));
    yearClause = `AND EXTRACT(YEAR FROM start_date) = $2`;
  }
  const result = await db.query(
    `SELECT * FROM leave_requests WHERE user_id = $1 ${yearClause}
     ORDER BY start_date DESC`,
    params
  );
  return toCsv(result.rows, [
    { label: 'id', key: 'id' },
    { label: 'leave_type', key: 'leave_type' },
    {
      label: 'start_date',
      value: (r) => toDateOnly(r.start_date),
    },
    { label: 'end_date', value: (r) => toDateOnly(r.end_date) },
    { label: 'days_count', key: 'days_count' },
    { label: 'status', key: 'status' },
    { label: 'half_day', key: 'half_day_flag' },
    { label: 'overlap', key: 'overlap_flag' },
    { label: 'special_approval', key: 'special_approval_flag' },
    { label: 'remarks', key: 'remarks' },
  ]);
}

async function exportApprovalsCsv(user) {
  const approvalService = require('./approvalService');
  let rows = [];
  try {
    rows = await approvalService.listPendingForApprover(user);
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      rows = await approvalService.listHistory(user, {});
    } else throw err;
  }
  if (!rows.length) {
    rows = await approvalService.listHistory(user, {});
  }
  return toCsv(rows, [
    { label: 'id', key: 'id' },
    { label: 'employee_id', value: (r) => r.applicant?.employee_id },
    { label: 'applicant', value: (r) => r.applicant?.name },
    { label: 'job_title', value: (r) => r.applicant?.job_title },
    { label: 'department', value: (r) => r.applicant?.department },
    { label: 'office_branch', value: (r) => r.applicant?.office_branch },
    { label: 'office_country', value: (r) => r.applicant?.office_country },
    { label: 'phone', value: (r) => r.applicant?.phone },
    { label: 'leave_type', key: 'leave_type' },
    { label: 'start_date', key: 'start_date' },
    { label: 'end_date', key: 'end_date' },
    { label: 'days_count', key: 'days_count' },
    { label: 'status', key: 'status' },
    { label: 'awaiting_role', key: 'awaiting_role' },
    { label: 'overlap', key: 'overlap_flag' },
    { label: 'special_approval', key: 'special_approval_flag' },
    {
      label: 'ai_risk',
      value: (r) => r.ai_summary?.risk_level || '',
    },
  ]);
}

/**
 * Single CSV "workbook-style" summary for managers/employees:
 * section rows for balance, counts, who's away, pending approvals.
 */
async function exportDashboardSummaryCsv(user) {
  const summary = await getSummary(user);
  const lines = [];
  const push = (row) => lines.push(row.map((c) => {
    const s = c == null ? '' : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));

  push(['section', 'metric', 'value']);
  push(['meta', 'exported_at', new Date().toISOString()]);
  push(['meta', 'user_id', user.id]);
  push(['meta', 'user_name', user.name]);
  push(['meta', 'role', user.role]);
  push(['meta', 'department', user.department || '']);

  const b = summary.balance || {};
  push(['balance', 'year', b.year]);
  push(['balance', 'annual_entitlement', b.annual_entitlement]);
  push(['balance', 'annual_balance', b.annual_balance]);
  push(['balance', 'annual_used', b.annual_used]);
  push(['balance', 'annual_pct_remaining', b.annual_pct_remaining]);
  push(['balance', 'sick_balance', b.sick_balance]);
  push(['balance', 'carried_forward', b.carried_forward]);

  const c = summary.my_leave_counts || {};
  push(['my_leave_counts', 'total', c.total]);
  push(['my_leave_counts', 'pending', c.pending]);
  push(['my_leave_counts', 'approved', c.approved]);
  push(['my_leave_counts', 'rejected', c.rejected]);
  push(['my_leave_counts', 'cancelled', c.cancelled]);
  push(['my_leave_counts', 'cancel_pending', c.cancel_pending]);

  push(['approver', 'pending_approvals', summary.pending_approvals]);
  push(['approver', 'high_risk_pending', summary.high_risk_pending]);
  push(['notifications', 'unread', summary.unread_notifications]);

  const away = summary.whos_away_this_week || {};
  push(['whos_away', 'range_start', away.start_date]);
  push(['whos_away', 'range_end', away.end_date]);
  push(['whos_away', 'count', (away.people || []).length]);

  // Blank line then detail table for people away
  lines.push('');
  lines.push(
    [
      'away_name',
      'department',
      'leave_type',
      'start_date',
      'end_date',
      'status',
      'days_count',
    ].join(',')
  );
  for (const p of away.people || []) {
    push([
      p.name,
      p.department,
      p.leave_type,
      p.start_date,
      p.end_date,
      p.status,
      p.days_count,
    ]);
  }

  return lines.join('\n');
}

async function exportWhosAwayCsv(user, query = {}) {
  const away = await getWhosAway(user, query);
  return toCsv(away.people || [], [
    { label: 'name', key: 'name' },
    { label: 'department', key: 'department' },
    { label: 'leave_type', key: 'leave_type' },
    { label: 'start_date', key: 'start_date' },
    { label: 'end_date', key: 'end_date' },
    { label: 'status', key: 'status' },
    { label: 'days_count', key: 'days_count' },
    { label: 'overlap', key: 'overlap_flag' },
  ]);
}

module.exports = {
  getMyBalance,
  getWhosAway,
  getPublicHolidays,
  getCompanyInfo,
  updateCompanyProfile,
  upsertCompanyOffice,
  deleteCompanyOffice,
  replaceCompanyOffices,
  getSummary,
  exportMyLeaveCsv,
  exportApprovalsCsv,
  exportDashboardSummaryCsv,
  exportWhosAwayCsv,
  toCsv,
};
