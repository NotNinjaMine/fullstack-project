/**
 * Integration-style tests for Member 3 approval workflow.
 * Uses SQLite seed data. Run: npm test (starts isolated against DB file).
 *
 * Note: tests call services directly + HTTP against running server if LIVE_API=1.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Ensure env before modules load
process.env.DB_DRIVER = process.env.DB_DRIVER || 'sqlite';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE = process.env.API_URL || 'http://localhost:3001';

async function req(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
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
  assert.equal(r.status, 200, `login failed for ${email}`);
  assert.equal(r.json.success, true);
  assert.ok(r.json.data.token);
  return r.json.data;
}

describe('Member 3 – Approval workflow (live API)', () => {
  let alice;
  let bob;
  let carol;
  let hr;

  before(async () => {
    // Fail fast if API down
    const health = await fetch(`${BASE}/health`).then((r) => r.json());
    assert.equal(health.success, true, 'API must be running: npm run dev');
    alice = await login('alice.tan@company.com');
    bob = await login('bob.supervisor@company.com');
    carol = await login('carol.manager@company.com');
    hr = await login('hr.admin@company.com');
  });

  it('envelope: unauthorised without token', async () => {
    const r = await req('GET', '/api/approvals');
    assert.equal(r.status, 401);
    assert.equal(r.json.success, false);
    assert.equal(r.json.code, 'UNAUTHORISED');
  });

  it('RBAC: employee cannot create delegation', async () => {
    const r = await req('POST', '/api/approvals/delegations', {
      token: alice.token,
      body: {
        delegate_id: 6,
        start_date: '2026-07-01',
        end_date: '2026-12-31',
      },
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, 'FORBIDDEN');
  });

  it('two-tier approve: supervisor then manager + balance', async () => {
    const create = await req('POST', '/api/leave', {
      token: alice.token,
      body: {
        leave_type: 'annual',
        start_date: '2026-12-07',
        end_date: '2026-12-08',
        remarks: 'unit test leave',
      },
    });
    assert.equal(create.status, 201);
    assert.equal(create.json.data.status, 'pending');
    const id = create.json.data.id;

    const bypass = await req('PUT', `/api/approvals/${id}/approve`, {
      token: carol.token,
      body: { note: 'illegal' },
    });
    assert.ok(bypass.status === 403 || bypass.status === 409);

    const sup = await req('PUT', `/api/approvals/${id}/approve`, {
      token: bob.token,
      body: { note: 'OK coverage' },
    });
    assert.equal(sup.status, 200);
    assert.equal(sup.json.data.status, 'supervisor_approved');

    const mgr = await req('PUT', `/api/approvals/${id}/approve`, {
      token: carol.token,
      body: { note: 'Final OK' },
    });
    assert.equal(mgr.status, 200);
    assert.equal(mgr.json.data.status, 'approved');
    assert.ok(mgr.json.data.balance_deducted > 0);
  });

  it('reject requires note', async () => {
    const create = await req('POST', '/api/leave', {
      token: alice.token,
      body: {
        leave_type: 'sick',
        start_date: '2026-12-14',
        end_date: '2026-12-14',
      },
    });
    const id = create.json.data.id;
    const empty = await req('PUT', `/api/approvals/${id}/reject`, {
      token: bob.token,
      body: { note: '' },
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.json.code, 'VALIDATION_ERROR');

    const ok = await req('PUT', `/api/approvals/${id}/reject`, {
      token: bob.token,
      body: { note: 'No coverage' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.status, 'rejected');
  });

  it('queue includes AI-3 summary', async () => {
    await req('POST', '/api/leave', {
      token: alice.token,
      body: {
        leave_type: 'annual',
        start_date: '2026-12-21',
        end_date: '2026-12-22',
      },
    });
    const q = await req('GET', '/api/approvals', { token: bob.token });
    assert.equal(q.status, 200);
    assert.ok(Array.isArray(q.json.data));
    if (q.json.data.length > 0) {
      const item = q.json.data[0];
      assert.ok(item.ai_summary, 'ai_summary required');
      assert.ok(item.ai_summary.risk_level);
      assert.equal(item.ai_summary.decision_required, true);
    }
  });

  it('HR cannot approve', async () => {
    const create = await req('POST', '/api/leave', {
      token: alice.token,
      body: {
        leave_type: 'unpaid',
        start_date: '2026-12-28',
        end_date: '2026-12-28',
      },
    });
    const id = create.json.data.id;
    // unpaid still needs approval path
    const r = await req('PUT', `/api/approvals/${id}/approve`, {
      token: hr.token,
      body: { note: 'hr' },
    });
    // HR is not assigned supervisor/manager → FORBIDDEN
    assert.ok(r.status === 403 || r.status === 409);
  });

  it('notifications list after workflow', async () => {
    const n = await req('GET', '/api/notifications', { token: alice.token });
    assert.equal(n.status, 200);
    assert.ok(Array.isArray(n.json.data));
  });

  it('ALREADY_ACTIONED on second final approve', async () => {
    const create = await req('POST', '/api/leave', {
      token: alice.token,
      body: {
        leave_type: 'annual',
        start_date: '2027-01-05',
        end_date: '2027-01-05',
      },
    });
    // may fail insufficient balance for 2027 — skip if so
    if (create.status !== 201) {
      // use another 2026 date
      const c2 = await req('POST', '/api/leave', {
        token: alice.token,
        body: {
          leave_type: 'other',
          start_date: '2026-11-02',
          end_date: '2026-11-02',
        },
      });
      assert.equal(c2.status, 201);
      const id = c2.json.data.id;
      await req('PUT', `/api/approvals/${id}/approve`, {
        token: bob.token,
        body: { note: 'a' },
      });
      await req('PUT', `/api/approvals/${id}/approve`, {
        token: carol.token,
        body: { note: 'b' },
      });
      const again = await req('PUT', `/api/approvals/${id}/approve`, {
        token: carol.token,
        body: { note: 'c' },
      });
      assert.equal(again.status, 409);
      assert.equal(again.json.code, 'ALREADY_ACTIONED');
      return;
    }
  });
});

describe('Member 3 – pure unit helpers', () => {
  it('rule-based AI summary returns decision_required', async () => {
    const { buildRuleBasedSummary } = require('../src/services/aiSummaryService');
    const s = buildRuleBasedSummary(
      {
        leave_type: 'annual',
        days_count: 3,
        start_date: '2026-08-10',
        end_date: '2026-08-12',
        overlap_flag: true,
        special_approval_flag: true,
        status: 'pending',
        applicant: { department: 'Finance' },
      },
      { teamOnLeaveCount: 2 }
    );
    assert.equal(s.decision_required, true);
    assert.ok(['low', 'medium', 'high'].includes(s.risk_level));
    assert.ok(Array.isArray(s.bullets));
  });

  it('response helpers shape', () => {
    const { success, fail } = require('../src/utils/response');
    const res = {
      statusCode: 200,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    success(res, { ok: 1 });
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, { ok: 1 });
    fail(res, 400, 'VALIDATION_ERROR', 'bad');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });
});
