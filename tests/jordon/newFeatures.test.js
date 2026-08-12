'use strict';

jest.mock('../../server/models', () => ({
  User: {},
  LeaveBalance: {},
  LeavePolicy: {},
  ConfigAuditLog: {},
  CountryWorkingDays: {}
}));

const { workingDaysInRange, computeDays } = require('../../server/services/calculationService');
const { prorateEntitlement } = require('../../server/services/entitlementService');

describe('new feature helpers', () => {
  test('workingDaysInRange excludes weekends and holidays', () => {
    const workingDays = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    const holidays = new Set(['2026-01-01']);

    const result = workingDaysInRange('2026-01-01', '2026-01-04', workingDays, holidays);
    expect(result).toEqual(['2026-01-02']);
  });

  test('computeDays respects half-day requests and holiday filtering', () => {
    const workingDays = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    const holidays = new Set(['2026-01-02']);

    expect(computeDays('2026-01-01', '2026-01-02', false, workingDays, holidays)).toBe(1);
    expect(computeDays('2026-01-01', '2026-01-02', true, workingDays, holidays)).toBe(0.5);
  });

  test('prorateEntitlement remains monotonic across later start dates', () => {
    const earlier = prorateEntitlement(10, '2026-01-15', 2026);
    const later = prorateEntitlement(10, '2026-02-15', 2026);

    expect(earlier).toBeGreaterThanOrEqual(later);
    expect(earlier).toBe(9.5);
    expect(later).toBe(9);
  });
});
