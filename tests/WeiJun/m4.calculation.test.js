// M4 (Coverage, Calendar & Scheduling Rules) pure-function unit tests — no DB.
//
// services/calculationService.js is the single source of truth for leave
// duration (UC-19): it reads a per-country weekend map (UC-29) instead of a
// hard-coded Sat/Sun, and excludes that country's public holidays. M2 and M5
// call this rather than re-implementing day counting, so a bug here is a bug
// everywhere balances are shown or deducted.
const {
    DEFAULT_WORKING_DAYS,
    isWorkingDay,
    workingDaysInRange,
    computeDays,
    hasAtLeastOneWorkingDay
} = require('../../backend/src/services/calculationService');

// A country whose weekend is Fri/Sat instead of Sat/Sun (e.g. several Middle
// Eastern markets) — the whole reason this reads a config instead of assuming.
const FRI_SAT_WEEKEND = { mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: true };

describe('calculationService.isWorkingDay', () => {
    test('under the default Sat/Sun config, Monday is working and Saturday is not', () => {
        const monday = new Date(2026, 7, 10);
        const saturday = new Date(2026, 7, 8);
        expect(isWorkingDay(monday, DEFAULT_WORKING_DAYS, new Set())).toBe(true);
        expect(isWorkingDay(saturday, DEFAULT_WORKING_DAYS, new Set())).toBe(false);
    });

    test('under a Fri/Sat weekend config, Friday is off and Sunday is working', () => {
        const friday = new Date(2026, 7, 7);
        const sunday = new Date(2026, 7, 9);
        expect(isWorkingDay(friday, FRI_SAT_WEEKEND, new Set())).toBe(false);
        expect(isWorkingDay(sunday, FRI_SAT_WEEKEND, new Set())).toBe(true);
    });

    test('a public holiday is not a working day even on a config working weekday', () => {
        const monday = new Date(2026, 7, 10);
        expect(isWorkingDay(monday, DEFAULT_WORKING_DAYS, new Set(['2026-08-10']))).toBe(false);
    });

    test('falls back to the default Sat/Sun config when none is supplied', () => {
        const saturday = new Date(2026, 7, 8);
        expect(isWorkingDay(saturday, null, new Set())).toBe(false);
    });
});

describe('calculationService.workingDaysInRange', () => {
    test('a Mon-Fri range under the default config returns all five weekdays', () => {
        const days = workingDaysInRange('2026-08-10', '2026-08-14', DEFAULT_WORKING_DAYS, new Set());
        expect(days).toHaveLength(5);
        expect(days[0]).toBe('2026-08-10');
        expect(days[4]).toBe('2026-08-14');
    });

    test('the same range under a Fri/Sat weekend swaps which days are excluded', () => {
        const days = workingDaysInRange('2026-08-10', '2026-08-14', FRI_SAT_WEEKEND, new Set());
        // Fri 14 Aug is the weekend under this config, so only 4 days count.
        expect(days).toEqual(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']);
    });
});

describe('calculationService.computeDays (UC-19: computed_days on a leave request)', () => {
    test('a half-day request is always 0.5 regardless of range length', () => {
        expect(computeDays('2026-08-10', '2026-08-10', true, DEFAULT_WORKING_DAYS, new Set())).toBe(0.5);
    });

    test('a full-day week counts five working days', () => {
        expect(computeDays('2026-08-10', '2026-08-14', false, DEFAULT_WORKING_DAYS, new Set())).toBe(5);
    });

    test('a range that lands entirely on a weekend/holiday computes to zero, not a negative or NaN', () => {
        expect(computeDays('2026-08-08', '2026-08-09', false, DEFAULT_WORKING_DAYS, new Set())).toBe(0);
    });

    test('a public holiday inside the range is excluded from the count', () => {
        // Mon-Fri (5 working days) minus one holiday on the Wednesday = 4.
        const days = computeDays('2026-08-10', '2026-08-14', false, DEFAULT_WORKING_DAYS, new Set(['2026-08-12']));
        expect(days).toBe(4);
    });
});

describe('calculationService.hasAtLeastOneWorkingDay (UC-29 business rule)', () => {
    test('the default Sat/Sun config passes', () => {
        expect(hasAtLeastOneWorkingDay(DEFAULT_WORKING_DAYS)).toBe(true);
    });

    test('a config with every day off is rejected', () => {
        const allOff = { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false };
        expect(hasAtLeastOneWorkingDay(allOff)).toBe(false);
    });

    test('a missing/undefined config is treated as having no working day', () => {
        expect(hasAtLeastOneWorkingDay(undefined)).toBe(false);
    });
});
