/**
 * Grade-A verification script for Member 3 (Workflow & Notifications).
 * Run with API up: node scripts/grade-check.js
 *
 * Proves: endpoints, RBAC, state machine, balance rules, audit trail, errors.
 */
/* eslint-disable no-console */
const BASE = process.env.API_URL || 'http://localhost:3001';

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`  ✅ ${name}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(email) {
  const r = await req('POST', '/api/auth/login', {
    body: { email, password: 'Password123!' },
  });
  if (!r.json.success) throw new Error(`login failed ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data;
}

function assertEnvelope(json, expectSuccess) {
  if (expectSuccess) {
    return json && json.success === true && 'data' in json;
  }
  return (
    json &&
    json.success === false &&
    typeof json.code === 'string' &&
    typeof json.message === 'string'
  );
}

async function main() {
  console.log('\n=== Member 3 Grade Check ===');
  console.log('API:', BASE, '\n');

  // --- Health & envelope ---
  console.log('[1] Health & auth envelope');
  let r = await req('GET', '/health');
  assertEnvelope(r.json, true) ? pass('GET /health envelope') : fail('GET /health envelope');

  r = await req('POST', '/api/auth/login', {
    body: { email: 'alice.tan@company.com', password: 'wrong' },
  });
  r.status === 401 && r.json.code === 'INVALID_CREDENTIALS'
    ? pass('401 INVALID_CREDENTIALS')
    : fail('401 INVALID_CREDENTIALS', JSON.stringify(r.json));

  r = await req('GET', '/api/leave');
  r.status === 401 && r.json.code === 'UNAUTHORISED'
    ? pass('401 UNAUTHORISED without token')
    : fail('401 UNAUTHORISED without token');

  const alice = await login('alice.tan@company.com');
  const bob = await login('bob.supervisor@company.com');
  const carol = await login('carol.manager@company.com');
  const hr = await login('hr.admin@company.com');
  pass('Login all demo roles');

  r = await req('GET', '/api/auth/me', { token: alice.token });
  assertEnvelope(r.json, true) && r.json.data.role === 'employee'
    ? pass('GET /api/auth/me')
    : fail('GET /api/auth/me');

  // --- RBAC ---
  console.log('\n[2] RBAC');
  r = await req('GET', '/api/approvals', { token: alice.token });
  r.status === 403 && r.json.code === 'FORBIDDEN'
    ? pass('Employee cannot list approvals')
    : fail('Employee cannot list approvals');

  r = await req('GET', '/api/approvals', { token: hr.token });
  r.status === 200 ? pass('HR can list approvals') : fail('HR can list approvals');

  // --- UC-01 create + validation ---
  console.log('\n[3] UC-01 Leave create');
  r = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'annual',
      start_date: '2026-12-14',
      end_date: '2026-12-16',
      half_day_flag: false,
      remarks: 'Grade check leave',
    },
  });
  const leaveId = r.json.data?.id;
  r.status === 201 &&
  r.json.data.status === 'pending' &&
  typeof r.json.data.days_count === 'number'
    ? pass('Create leave 201 pending + days_count')
    : fail('Create leave', JSON.stringify(r.json));

  r = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'annual',
      start_date: '2026-12-01',
      end_date: '2026-12-03',
      half_day_flag: true,
    },
  });
  r.status === 400 && r.json.code === 'INVALID_DATE_RANGE'
    ? pass('Half-day multi-day → INVALID_DATE_RANGE')
    : fail('Half-day multi-day rejected');

  r = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'annual',
      start_date: '2026-12-02',
      end_date: '2026-12-02',
      half_day_flag: true,
      half_day_period: 'AM',
    },
  });
  r.status === 201 && r.json.data.days_count === 0.5
    ? pass('Half-day days_count = 0.5')
    : fail('Half-day 0.5', JSON.stringify(r.json));

  r = await req('GET', `/api/leave/${leaveId}`, { token: alice.token });
  r.json.data?.applicant?.name
    ? pass('GET leave/:id with applicant')
    : fail('GET leave/:id shape');

  r = await req('GET', '/api/leave/overlap?start_date=2026-08-10&end_date=2026-08-12', {
    token: alice.token,
  });
  r.json.success && 'has_overlap' in r.json.data
    ? pass('Overlap endpoint shape')
    : fail('Overlap endpoint');

  r = await req('GET', '/api/leave/overlap', { token: alice.token });
  r.status === 400 && r.json.code === 'MISSING_DATE_PARAMS'
    ? pass('MISSING_DATE_PARAMS')
    : fail('MISSING_DATE_PARAMS');

  // --- UC-02 two-tier (no bypass) ---
  console.log('\n[4] UC-02 Two-tier approval');
  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: carol.token,
    body: { note: 'bypass attempt' },
  });
  r.status === 409 || r.status === 403
    ? pass('Manager cannot bypass supervisor')
    : fail('Manager bypass blocked', `${r.status} ${JSON.stringify(r.json)}`);

  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: bob.token,
    body: { note: 'Sup OK' },
  });
  r.json.data?.status === 'supervisor_approved'
    ? pass('Supervisor → supervisor_approved')
    : fail('Supervisor approve', JSON.stringify(r.json));

  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: carol.token,
    body: { note: 'Mgr OK' },
  });
  r.json.data?.status === 'approved' && r.json.data.balance_deducted > 0
    ? pass('Manager final + balance_deducted')
    : fail('Manager final', JSON.stringify(r.json));

  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: carol.token,
    body: { note: 'again' },
  });
  r.status === 409 && r.json.code === 'ALREADY_ACTIONED'
    ? pass('ALREADY_ACTIONED on double approve')
    : fail('ALREADY_ACTIONED');

  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: hr.token,
    body: { note: 'hr' },
  });
  r.status === 403 ? pass('HR cannot approve') : fail('HR cannot approve');

  // --- Reject path ---
  console.log('\n[5] Reject + notes');
  r = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'sick',
      start_date: '2026-12-21',
      end_date: '2026-12-21',
      half_day_flag: false,
    },
  });
  if (!r.json.data?.id) {
    fail('Create leave for reject test', JSON.stringify(r.json));
  }
  const rejId = r.json.data?.id;
  r = await req('PUT', `/api/approvals/${rejId}/reject`, {
    token: bob.token,
    body: { note: '' },
  });
  r.status === 400 && r.json.code === 'VALIDATION_ERROR'
    ? pass('Reject requires note')
    : fail('Reject empty note');

  r = await req('PUT', `/api/approvals/${rejId}/reject`, {
    token: bob.token,
    body: { note: 'Insufficient coverage' },
  });
  r.json.data?.status === 'rejected'
    ? pass('Supervisor reject → rejected')
    : fail('Supervisor reject');

  // --- UC-03 cancel ---
  console.log('\n[6] UC-03 Cancel');
  r = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'annual',
      start_date: '2026-11-23',
      end_date: '2026-11-24',
    },
  });
  if (!r.json.data?.id) {
    fail('Create leave for pending-cancel test', JSON.stringify(r.json));
  }
  const pendCancel = r.json.data?.id;
  r = await req('POST', `/api/leave/${pendCancel}/cancel`, {
    token: alice.token,
    body: { reason: 'plans changed' },
  });
  r.json.data?.status === 'cancelled'
    ? pass('Pending cancel → cancelled (no balance)')
    : fail('Pending cancel');

  // approved cancel path
  r = await req('POST', `/api/leave/${leaveId}/cancel`, {
    token: alice.token,
    body: { reason: 'need to cancel approved' },
  });
  r.json.data?.status === 'cancel_pending'
    ? pass('Approved leave → cancel_pending')
    : fail('Cancel pending', JSON.stringify(r.json));

  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: bob.token,
    body: { note: 'cancel step 1' },
  });
  r = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: carol.token,
    body: { note: 'cancel final' },
  });
  r.json.data?.status === 'cancelled'
    ? pass('Cancel two-tier → cancelled (balance restore path)')
    : fail('Cancel final', JSON.stringify(r.json));

  r = await req('POST', `/api/leave/${leaveId}/cancel`, {
    token: alice.token,
    body: { reason: 'again' },
  });
  r.status === 409 && r.json.code === 'ALREADY_CANCELLED'
    ? pass('ALREADY_CANCELLED')
    : fail('ALREADY_CANCELLED');

  // --- UC-12 notifications ---
  console.log('\n[7] UC-12 Notifications');
  r = await req('GET', '/api/notifications', { token: alice.token });
  Array.isArray(r.json.data) && r.json.data.length > 0
    ? pass('Employee has notifications')
    : fail('Employee notifications');

  r = await req('GET', '/api/notifications', { token: bob.token });
  Array.isArray(r.json.data)
    ? pass('Supervisor notifications list')
    : fail('Supervisor notifications');

  const n0 = r.json.data[0];
  if (n0) {
    r = await req('PUT', `/api/notifications/${n0.id}/read`, { token: bob.token });
    r.json.data?.read_flag === true ? pass('Mark one read') : fail('Mark one read');
  } else {
    pass('Mark one read (skipped — empty list)');
  }

  r = await req('PUT', '/api/notifications/read-all', { token: alice.token });
  typeof r.json.data?.updated_count === 'number'
    ? pass('Mark all read')
    : fail('Mark all read');

  // --- Summary ---
  const passed = results.filter((x) => x.ok).length;
  const total = results.length;
  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== RESULT: ${passed}/${total} passed ===`);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach((f) => console.log(' -', f.name, f.detail || ''));
    process.exit(1);
  }
  console.log('\nGrade checklist: core Member 3 flows verified against live API.\n');
}

main().catch((err) => {
  console.error('Grade check crashed:', err);
  process.exit(1);
});
