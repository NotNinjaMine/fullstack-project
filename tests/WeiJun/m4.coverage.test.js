// M4 (Coverage, Calendar & Scheduling Rules) pure-function unit tests — no DB,
// run under jest like the M2/M3/M5 tests: `npm test` in backend/.
//
// services/coverage.js is the AI-2 "Smart Coverage Analyzer" engine (UC-07).
// It is deliberately pure: date maths + array filtering over data the routes
// already fetched, so every rule can be tested here without a database.
const {
    isWorkingDay,
    workingDaysInRange,
    offOn,
    evaluateCoverage,
    suggestAlternative,
    MIN_PRESENT
} = require('../../backend/src/services/coverage');

describe('coverage.isWorkingDay', () => {
    test('Saturday and Sunday are never working days, holiday or not', () => {
        const sat = new Date(2026, 7, 8);  // 8 Aug 2026 is a Saturday
        const sun = new Date(2026, 7, 9);
        expect(isWorkingDay(sat, new Set())).toBe(false);
        expect(isWorkingDay(sun, new Set())).toBe(false);
    });

    test('a weekday is a working day unless it is in the holiday set', () => {
        const monday = new Date(2026, 7, 10); // 10 Aug 2026 is a Monday
        expect(isWorkingDay(monday, new Set())).toBe(true);
        expect(isWorkingDay(monday, new Set(['2026-08-10']))).toBe(false);
    });
});

describe('coverage.workingDaysInRange', () => {
    test('drops weekends from a range that spans one', () => {
        // Fri 7 Aug -> Mon 10 Aug 2026: Sat/Sun excluded, National Day (9 Aug) excluded too
        const days = workingDaysInRange('2026-08-07', '2026-08-10', new Set(['2026-08-09']));
        expect(days).toEqual(['2026-08-07', '2026-08-10']);
    });

    test('a single working day returns that one date', () => {
        expect(workingDaysInRange('2026-08-10', '2026-08-10', new Set())).toEqual(['2026-08-10']);
    });

    test('a range that is entirely a weekend returns no days', () => {
        expect(workingDaysInRange('2026-08-08', '2026-08-09', new Set())).toEqual([]);
    });
});

describe('coverage.offOn', () => {
    const leaves = [
        { userId: 1, startDate: '2026-08-10', endDate: '2026-08-12' },
        { userId: 2, startDate: '2026-08-11', endDate: '2026-08-11' }
    ];

    test('returns every user on approved leave that date', () => {
        expect(offOn('2026-08-11', leaves)).toEqual(expect.arrayContaining([1, 2]));
    });

    test('excludes the requester even if they have their own leave row that date', () => {
        expect(offOn('2026-08-11', leaves, 1)).toEqual([2]);
    });

    test('a date nobody is off on returns an empty list', () => {
        expect(offOn('2026-08-20', leaves)).toEqual([]);
    });
});

describe('coverage.evaluateCoverage (UC-07: team coverage threshold)', () => {
    const teamSize = 5;

    test('no conflict when enough of the team remains present', () => {
        // requester + 1 other off, team of 5 -> 3 present, meets MIN_PRESENT (3)
        const leaves = [{ userId: 2, startDate: '2026-08-10', endDate: '2026-08-10' }];
        const conflicts = evaluateCoverage(['2026-08-10'], leaves, 1, teamSize);
        expect(conflicts).toEqual([]);
    });

    test('flags a date where presence drops below the minimum', () => {
        // requester + 2 others off, team of 5 -> 2 present, below MIN_PRESENT (3)
        const leaves = [
            { userId: 2, startDate: '2026-08-10', endDate: '2026-08-10' },
            { userId: 3, startDate: '2026-08-10', endDate: '2026-08-10' }
        ];
        const conflicts = evaluateCoverage(['2026-08-10'], leaves, 1, teamSize);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ date: '2026-08-10', present: teamSize - 2 - 1 });
        expect(conflicts[0].offUserIds).toEqual(expect.arrayContaining([2, 3]));
    });

    test('only the days that actually breach the threshold are reported, not the whole range', () => {
        const leaves = [
            { userId: 2, startDate: '2026-08-10', endDate: '2026-08-10' },
            { userId: 3, startDate: '2026-08-10', endDate: '2026-08-10' }
        ];
        const conflicts = evaluateCoverage(['2026-08-10', '2026-08-11'], leaves, 1, teamSize);
        expect(conflicts.map((c) => c.date)).toEqual(['2026-08-10']);
    });

    test('MIN_PRESENT is 3, matching the HLD business rule (>= 3 of 5 present)', () => {
        expect(MIN_PRESENT).toBe(3);
    });
});

describe('coverage.suggestAlternative (UC-07: nearest full-coverage window)', () => {
    test('finds the next same-length window with no conflicts', () => {
        // Team of 5 (the HLD's own "3 of 5" example), requester is user 1.
        // Users 2, 3 and 4 are all off 11-12 Aug, dropping presence to 1 on
        // those days, so a 2-day request right after 10 Aug must skip forward
        // past the whole overlap before it finds a clean window.
        const leaves = [
            { userId: 2, startDate: '2026-08-11', endDate: '2026-08-12' },
            { userId: 3, startDate: '2026-08-11', endDate: '2026-08-12' },
            { userId: 4, startDate: '2026-08-11', endDate: '2026-08-12' }
        ];
        const result = suggestAlternative('2026-08-10', 2, leaves, 1, 5, new Set());
        expect(result).toEqual({ start: '2026-08-13', end: '2026-08-14' });
    });

    test('returns null when 90 days of probing finds nothing (defensive bound)', () => {
        // Team of 1 (just the requester) can never reach MIN_PRESENT = 3, so
        // every window is a conflict and the search must terminate, not hang.
        const result = suggestAlternative('2026-08-10', 1, [], 1, 1, new Set());
        expect(result).toBeNull();
    });
});
