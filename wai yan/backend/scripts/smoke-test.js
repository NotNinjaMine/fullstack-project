/**
 * End-to-end smoke test against a running API (default http://localhost:3001).
 * Usage: node scripts/smoke-test.js
 * Requires: npm run seed && npm start
 */
/* eslint-disable no-console */
const BASE = process.env.API_URL || 'http://localhost:3001';

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email) {
  const { status, json } = await req('POST', '/api/auth/login', {
    body: { email, password: 'Password123!' },
  });
  assert(status === 200 && json.success, `login failed for ${email}: ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  console.log('Smoke test →', BASE);

  const health = await req('GET', '/health');
  assert(health.status === 200, 'health check failed');

  const alice = await login('alice.tan@company.com');
  const bob = await login('bob.supervisor@company.com');
  const carol = await login('carol.manager@company.com');

  const me = await req('GET', '/api/auth/me', { token: alice.token });
  assert(me.json.data.email === 'alice.tan@company.com', 'me profile mismatch');

  // Create leave (weekday range)
  const create = await req('POST', '/api/leave', {
    token: alice.token,
    body: {
      leave_type: 'annual',
      start_date: '2026-10-05',
      end_date: '2026-10-07',
      half_day_flag: false,
      remarks: 'Smoke test leave',
    },
  });
  assert(create.status === 201 && create.json.success, `create leave failed: ${JSON.stringify(create.json)}`);
  const leaveId = create.json.data.id;
  console.log('Created leave', leaveId, create.json.data);

  // Supervisor approve
  const sup = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: bob.token,
    body: { note: 'Coverage OK' },
  });
  assert(sup.json.data?.status === 'supervisor_approved', `supervisor approve failed: ${JSON.stringify(sup.json)}`);
  console.log('Supervisor approved');

  // Manager approve → balance deducted
  const mgr = await req('PUT', `/api/approvals/${leaveId}/approve`, {
    token: carol.token,
    body: { note: 'Final OK' },
  });
  assert(mgr.json.data?.status === 'approved', `manager approve failed: ${JSON.stringify(mgr.json)}`);
  assert(mgr.json.data.balance_deducted > 0, 'expected balance_deducted');
  console.log('Manager approved, balance_deducted=', mgr.json.data.balance_deducted);

  // Notifications for alice
  const notif = await req('GET', '/api/notifications', { token: alice.token });
  assert(Array.isArray(notif.json.data), 'notifications list missing');
  console.log('Alice notifications:', notif.json.data.length);

  // Cancel approved → cancel_pending
  const cancel = await req('POST', `/api/leave/${leaveId}/cancel`, {
    token: alice.token,
    body: { reason: 'Plans changed' },
  });
  assert(cancel.json.data?.status === 'cancel_pending', `cancel failed: ${JSON.stringify(cancel.json)}`);
  console.log('Cancel pending OK');

  // Overlap check
  const overlap = await req('GET', '/api/leave/overlap?start_date=2026-08-10&end_date=2026-08-12', {
    token: alice.token,
  });
  assert(overlap.json.success, 'overlap check failed');
  console.log('Overlap has_overlap=', overlap.json.data.has_overlap);

  // Unauthorised without token
  const unauth = await req('GET', '/api/leave');
  assert(unauth.status === 401, 'expected 401 without token');

  console.log('\n✅ Smoke test passed');
}

main().catch((err) => {
  console.error('\n❌ Smoke test failed:', err.message);
  process.exit(1);
});
