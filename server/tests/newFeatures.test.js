// M1/M4/M5 pure-function unit tests (no DB needed — run under jest like the M3 tests).
const calc = require('../services/calculationService');
const { prorateEntitlement } = require('../services/entitlementService');
const { classifyOffline } = require('../services/queryCatalogue');
const { isDue } = require('../services/reportScheduleService');

describe('calculationService.workingDaysInRange', () => {
    const WD = calc.DEFAULT_WORKING_DAYS; // Sat/Sun off

    test('excludes weekends', () => {
        // 2026-08-10 (Mon) .. 2026-08-16 (Sun) → Mon-Fri = 5 working days
        const days = calc.workingDaysInRange('2026-08-10', '2026-08-16', WD, new Set());
        expect(days).toHaveLength(5);
    });

    test('excludes public holidays', () => {
        const holidays = new Set(['2026-08-12']);
        const days = calc.workingDaysInRange('2026-08-10', '2026-08-14', WD, holidays);
        expect(days).toHaveLength(4); // Mon-Fri minus the Wed holiday
    });

    test('custom weekend config (Fri/Sat off) shifts working days', () => {
        const friSatOff = { mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: true };
        const days = calc.workingDaysInRange('2026-08-10', '2026-08-16', friSatOff, new Set());
        // Mon,Tue,Wed,Thu,Sun = 5
        expect(days).toContain('2026-08-16'); // Sunday counts as working
        expect(days).not.toContain('2026-08-14'); // Friday off
    });

    test('computeDays honours half-day', () => {
        expect(calc.computeDays('2026-08-10', '2026-08-10', true, WD, new Set())).toBe(0.5);
        expect(calc.computeDays('2026-08-10', '2026-08-11', false, WD, new Set())).toBe(2);
    });

    test('hasAtLeastOneWorkingDay guards against a full-weekend week', () => {
        expect(calc.hasAtLeastOneWorkingDay({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })).toBe(false);
        expect(calc.hasAtLeastOneWorkingDay(calc.DEFAULT_WORKING_DAYS)).toBe(true);
    });
});

describe('entitlementService.prorateEntitlement', () => {
    test('joined before the year → full entitlement', () => {
        expect(prorateEntitlement(14, '2025-06-01', 2026)).toBe(14);
    });
    test('joins next year → zero this year', () => {
        expect(prorateEntitlement(14, '2027-01-01', 2026)).toBe(0);
    });
    test('joins 1 July → half the year (7 of 14)', () => {
        expect(prorateEntitlement(14, '2026-07-01', 2026)).toBe(7);
    });
    test('joins mid-month (>=15th) loses a half month', () => {
        // Jul 15: monthsRemaining = 6 - 0.5 = 5.5 → 14 * 5.5/12 = 6.416.. → 6.5
        expect(prorateEntitlement(14, '2026-07-15', 2026)).toBe(6.5);
    });
});

describe('queryCatalogue.classifyOffline', () => {
    test('maps country-usage question', () => {
        expect(classifyOffline('which country has the highest leave usage?')).toBe('leave_usage_by_country');
    });
    test('maps forfeiture question', () => {
        expect(classifyOffline('who has unused leave at risk of forfeiture?')).toBe('unused_balance_by_employee');
    });
    test('maps pending question', () => {
        expect(classifyOffline('how many requests are pending approval?')).toBe('pending_overview');
    });
    test('unrelated question → null', () => {
        expect(classifyOffline('what is the weather today')).toBeNull();
    });
});

describe('reportScheduleService.isDue', () => {
    const now = new Date('2026-07-15T00:00:00Z');
    test('never run → due', () => {
        expect(isDue({ active: true, frequency: 'monthly', lastRunAt: null }, now)).toBe(true);
    });
    test('inactive → not due', () => {
        expect(isDue({ active: false, frequency: 'weekly', lastRunAt: null }, now)).toBe(false);
    });
    test('monthly, 40 days ago → due', () => {
        const last = new Date(now.getTime() - 40 * 24 * 3600 * 1000);
        expect(isDue({ active: true, frequency: 'monthly', lastRunAt: last }, now)).toBe(true);
    });
    test('monthly, 10 days ago → not due', () => {
        const last = new Date(now.getTime() - 10 * 24 * 3600 * 1000);
        expect(isDue({ active: true, frequency: 'monthly', lastRunAt: last }, now)).toBe(false);
    });
});
