'use strict';

jest.mock('../../server/models', () => ({
  User: {},
  LeaveBalance: {},
  LeavePolicy: {},
  ConfigAuditLog: {},
  UserSession: {},
  TwoFactorChallenge: {},
  Notification: {},
  LeaveRequest: {},
  AuditLog: {},
  CountryWorkingDays: {}
}));

const { prorateEntitlement } = require('../../server/services/entitlementService');
const { todaySGT } = require('../../server/services/dateService');
// Was mailer.isDemoAddress; M5's domain migration moved the single source of
// truth for "is this a seeded demo account?" into demoEmailDomain.
const { isDemoEmail } = require('../../server/services/demoEmailDomain');
const { requireRole } = require('../../server/middlewares/auth');

describe('entitlement and access helpers', () => {
  test('prorateEntitlement scales with the join month and stays bounded', () => {
    expect(prorateEntitlement(10, '2026-01-15', 2026)).toBe(9.5);
    expect(prorateEntitlement(10, '2026-06-15', 2026)).toBe(5.5);
    expect(prorateEntitlement(10, '2025-12-01', 2026)).toBe(10);
    expect(prorateEntitlement(10, '2027-01-01', 2026)).toBe(0);
  });

  test('todaySGT returns a Singapore date string', () => {
    const value = todaySGT();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${value}T00:00:00+08:00`)).toBeInstanceOf(Date);
  });

  test('isDemoEmail recognises seeded demo domains but not lookalikes', () => {
    expect(isDemoEmail('person@innovare.com')).toBe(true);
    expect(isDemoEmail('person@wypledu.online')).toBe(true);
    expect(isDemoEmail('person@notinnovare.com')).toBe(false);
    expect(isDemoEmail('person@innovare.com.attacker.net')).toBe(false);
  });

  test('requireRole allows the listed role and rejects unauthorised access', () => {
    const next = jest.fn();
    const allowed = { user: { role: 'MANAGER' } };
    const denied = { user: { role: 'EMPLOYEE' } };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };

    requireRole('MANAGER', 'HR_ADMIN')(allowed, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    const deniedRes = { ...res, statusCode: 200, body: null };
    requireRole('MANAGER', 'HR_ADMIN')(denied, deniedRes, next);
    expect(deniedRes.statusCode).toBe(403);
    expect(deniedRes.body).toEqual({ message: 'Forbidden: insufficient role.' });
  });
});
