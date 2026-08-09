// M2 (Employee Leave Experience) pure-function unit tests — no DB, run under jest
// like the M3/M4/M5 tests: `npm test` in server/.
const rules = require('../../server/services/leaveRules');
const { buildIcs, addOneDay, escapeText } = require('../../server/services/icsService');

describe('leaveRules.sgtTodayISO', () => {
    test('uses Singapore time, not the server timezone', () => {
        // 2026-07-28 20:00 UTC is already 2026-07-29 in SGT (UTC+8).
        expect(rules.sgtTodayISO(new Date('2026-07-28T20:00:00Z'))).toBe('2026-07-29');
        expect(rules.sgtTodayISO(new Date('2026-07-28T10:00:00Z'))).toBe('2026-07-28');
    });
});

describe('leaveRules.overlapCheck (UC-01: no double booking)', () => {
    const existing = [
        { id: 10, startDate: '2026-08-10', endDate: '2026-08-12', halfDay: false, halfDayPeriod: null },
        { id: 11, startDate: '2026-09-01', endDate: '2026-09-01', halfDay: true, halfDayPeriod: 'AM' }
    ];

    test('blocks a range that overlaps an existing request', () => {
        const res = rules.overlapCheck(existing, { startDate: '2026-08-12', endDate: '2026-08-14', halfDay: false });
        expect(res.ok).toBe(false);
        expect(res.message).toContain('REQ-10');
    });

    test('blocks a range that fully contains an existing request', () => {
        expect(rules.overlapCheck(existing, { startDate: '2026-08-01', endDate: '2026-08-31', halfDay: false }).ok)
            .toBe(false);
    });

    test('allows an adjacent, non-overlapping range', () => {
        expect(rules.overlapCheck(existing, { startDate: '2026-08-13', endDate: '2026-08-14', halfDay: false }).ok)
            .toBe(true);
    });

    test('allows the opposite half of a day already half-booked', () => {
        const res = rules.overlapCheck(existing, {
            startDate: '2026-09-01', endDate: '2026-09-01', halfDay: true, halfDayPeriod: 'PM'
        });
        expect(res.ok).toBe(true);
    });

    test('blocks the SAME half of a day already half-booked', () => {
        const res = rules.overlapCheck(existing, {
            startDate: '2026-09-01', endDate: '2026-09-01', halfDay: true, halfDayPeriod: 'AM'
        });
        expect(res.ok).toBe(false);
    });

    test('ignores the row being edited (excludeRequestId)', () => {
        const res = rules.overlapCheck(existing, {
            id: 10, startDate: '2026-08-10', endDate: '2026-08-12', halfDay: false
        });
        expect(res.ok).toBe(true);
    });
});

describe('leaveRules.backdateCheck (UC-01 / UC-05)', () => {
    const today = '2026-07-29';

    test('annual leave cannot start in the past', () => {
        expect(rules.backdateCheck('annual', '2026-07-28', today).ok).toBe(false);
    });
    test('annual leave today or later is fine', () => {
        expect(rules.backdateCheck('annual', today, today).ok).toBe(true);
        expect(rules.backdateCheck('annual', '2026-08-01', today).ok).toBe(true);
    });
    test('sick leave may be back-dated inside the window', () => {
        expect(rules.backdateCheck('sick_mc', '2026-07-27', today).ok).toBe(true);
        expect(rules.backdateCheck('sick_nomc', '2026-07-16', today).ok).toBe(true); // 13 days
    });
    test('sick leave beyond the window is refused', () => {
        const res = rules.backdateCheck('sick_mc', '2026-06-01', today);
        expect(res.ok).toBe(false);
        expect(res.message).toContain('back-dated');
    });
});

describe('leaveRules.sickQuotaCheck (UC-05 country policy)', () => {
    const TH = { country: 'TH', countryName: 'Thailand', sickMc: 30, sickNoMc: 0 };
    const SG = { country: 'SG', countryName: 'Singapore', sickMc: 12, sickNoMc: 2 };

    test('Thailand grants no sick leave without an MC', () => {
        const res = rules.sickQuotaCheck('sick_nomc', TH);
        expect(res.ok).toBe(false);
        expect(res.message).toContain('Thailand');
    });
    test('Thailand still allows MC-backed sick leave', () => {
        expect(rules.sickQuotaCheck('sick_mc', TH).ok).toBe(true);
    });
    test('Singapore allows both', () => {
        expect(rules.sickQuotaCheck('sick_nomc', SG).ok).toBe(true);
        expect(rules.sickQuotaCheck('sick_mc', SG).ok).toBe(true);
    });
    test('annual leave is unaffected by sick quotas', () => {
        expect(rules.sickQuotaCheck('annual', TH).ok).toBe(true);
    });
});

describe('leaveRules.attachmentCheck (UC-13)', () => {
    test('accepts PDF / JPG / PNG data URLs', () => {
        expect(rules.attachmentCheck({ attachmentType: 'application/pdf', attachmentData: 'data:application/pdf;base64,AAAA' }).ok).toBe(true);
        expect(rules.attachmentCheck({ attachmentType: 'image/png', attachmentData: 'data:image/png;base64,AAAA' }).ok).toBe(true);
    });
    test('rejects other file types', () => {
        const res = rules.attachmentCheck({ attachmentType: 'application/zip', attachmentData: 'data:application/zip;base64,AAAA' });
        expect(res.ok).toBe(false);
        expect(res.message).toContain('PDF');
    });
    test('rejects a non-data-URL payload', () => {
        expect(rules.attachmentCheck({ attachmentType: 'application/pdf', attachmentData: 'http://evil/mc.pdf' }).ok).toBe(false);
    });
    test('no attachment at all is not an error (only sick_mc requires one)', () => {
        expect(rules.attachmentCheck({}).ok).toBe(true);
    });
});

describe('leaveRules.forecastBalance (UC-14 what-if)', () => {
    const balance = { entitled: 14, carried: 5, used: 7.5 };

    test('pending days are reserved', () => {
        const f = rules.forecastBalance(balance, 2, 1);
        expect(f.remainingBefore).toBe(9.5);  // 14 + 5 - 7.5 - 2
        expect(f.remainingAfter).toBe(8.5);
        expect(f.sufficient).toBe(true);
    });
    test('exactly using the last day is still sufficient', () => {
        expect(rules.forecastBalance(balance, 0, 11.5).sufficient).toBe(true);
    });
    test('one day too many is insufficient', () => {
        const f = rules.forecastBalance(balance, 0, 12);
        expect(f.sufficient).toBe(false);
        expect(f.remainingAfter).toBe(-0.5);
    });
    test('half-days keep .5 precision', () => {
        expect(rules.forecastBalance(balance, 0, 0.5).remainingAfter).toBe(11);
    });
});

describe('leaveRules.swapCompatible (UC-27 balances never change)', () => {
    const today = '2026-07-29';
    const mine = { id: 1, days: 2, halfDay: false, startDate: '2026-08-10', endDate: '2026-08-11' };
    const theirs = { id: 2, days: 2, halfDay: false, startDate: '2026-08-17', endDate: '2026-08-18' };

    test('equal-cost future entries can swap', () => {
        expect(rules.swapCompatible({
            mine, theirs, todayISO: today,
            proposerDaysOnTheirDates: 2, counterpartDaysOnMyDates: 2
        }).ok).toBe(true);
    });

    test('different day counts are refused', () => {
        const res = rules.swapCompatible({
            mine, theirs: { ...theirs, days: 3 }, todayISO: today,
            proposerDaysOnTheirDates: 3, counterpartDaysOnMyDates: 2
        });
        expect(res.ok).toBe(false);
        expect(res.message).toContain('same number of days');
    });

    test('leave that already started cannot be swapped', () => {
        expect(rules.swapCompatible({
            mine: { ...mine, startDate: '2026-07-20' }, theirs, todayISO: today,
            proposerDaysOnTheirDates: 2, counterpartDaysOnMyDates: 2
        }).ok).toBe(false);
    });

    test('cross-country calendar drift is refused (a holiday on one side)', () => {
        // Their dates contain a public holiday in MY country → 1 day instead of 2.
        const res = rules.swapCompatible({
            mine, theirs, todayISO: today,
            proposerDaysOnTheirDates: 1, counterpartDaysOnMyDates: 2
        });
        expect(res.ok).toBe(false);
        expect(res.message).toContain('would change your balance');
    });
});

describe('icsService.buildIcs (UC-14 calendar export)', () => {
    const req = {
        id: 501, startDate: '2026-08-10', endDate: '2026-08-11',
        halfDay: false, halfDayPeriod: null, days: 2,
        reason: 'Family trip', leaveType: 'annual'
    };

    test('all-day event uses an exclusive DTEND (end date + 1)', () => {
        const ics = buildIcs(req, { employeeName: 'Tan Wei Ling', typeLabel: 'Annual Leave' });
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('DTSTART;VALUE=DATE:20260810');
        expect(ics).toContain('DTEND;VALUE=DATE:20260812');
        expect(ics).toContain('UID:leave-501@innovare-lms');
        expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    });

    test('half-day becomes a timed event in Singapore office hours', () => {
        const pm = buildIcs({ ...req, endDate: '2026-08-10', halfDay: true, halfDayPeriod: 'PM', days: 0.5 });
        expect(pm).toContain('DTSTART:20260810T050000Z'); // 13:00 SGT
        expect(pm).toContain('DTEND:20260810T100000Z');   // 18:00 SGT
    });

    test('CRLF line endings and escaped text (RFC 5545)', () => {
        const ics = buildIcs({ ...req, reason: 'Trip; with family, really' });
        expect(ics).toContain('\r\n');
        expect(ics).toContain('Trip\\; with family\\, really');
    });

    test('addOneDay crosses month boundaries', () => {
        expect(addOneDay('2026-08-31')).toBe('2026-09-01');
        expect(addOneDay('2026-12-31')).toBe('2027-01-01');
    });

    test('escapeText escapes newlines', () => {
        expect(escapeText('a\nb')).toBe('a\\nb');
    });
});

/* ============================================================================
 * UC-03 (extended): returning early from approved leave.
 * The same engine serves the employee's "I am coming back on Wednesday" and
 * HR's correction of leave that is already under way, so the rules are tested
 * once here and exercised through both routes in api.m2.integration.test.js.
 * ========================================================================= */

describe('leaveRules.shortenCheck', () => {
    const approved = {
        startDate: '2026-12-01',
        endDate: '2026-12-05',
        status: 'APPROVED',
        halfDay: false,
        cancellationRequested: false
    };
    const beforeItStarts = '2026-11-20';

    test('accepts a date inside the original range', () => {
        expect(rules.shortenCheck(approved, '2026-12-03', beforeItStarts)).toEqual({ ok: true });
    });

    test('the new end date must stay inside the original leave', () => {
        const after = rules.shortenCheck(approved, '2026-12-09', beforeItStarts);
        expect(after.ok).toBe(false);
        expect(after.message).toMatch(/inside the original leave/i);

        const before = rules.shortenCheck(approved, '2026-11-30', beforeItStarts);
        expect(before.ok).toBe(false);
    });

    test('the existing end date is not a shortening', () => {
        const res = rules.shortenCheck(approved, '2026-12-05', beforeItStarts);
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/nothing to shorten/i);
    });

    test('only approved leave can be shortened', () => {
        for (const status of ['PENDING_SUPERVISOR', 'PENDING_MANAGER', 'REJECTED', 'CANCELLED', 'DRAFT']) {
            const res = rules.shortenCheck({ ...approved, status }, '2026-12-03', beforeItStarts);
            expect(res.ok).toBe(false);
            expect(res.message).toMatch(/only approved leave/i);
        }
    });

    test('a leave already awaiting a cancellation decision is refused', () => {
        const res = rules.shortenCheck(
            { ...approved, cancellationRequested: true }, '2026-12-03', beforeItStarts
        );
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/already awaiting/i);
    });

    test('a half-day has nothing to shorten', () => {
        const res = rules.shortenCheck(
            { ...approved, endDate: '2026-12-01', halfDay: true }, '2026-12-01', beforeItStarts
        );
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/half-day/i);
    });

    test('a malformed date is rejected rather than coerced', () => {
        for (const bad of ['', null, '3 Dec', '2026-13-01x', '01-12-2026']) {
            expect(rules.shortenCheck(approved, bad, beforeItStarts).ok).toBe(false);
        }
    });

    // The boundary the two doors are built around.
    test('the employee is turned away once the leave has started, and pointed at HR', () => {
        const started = rules.shortenCheck(approved, '2026-12-03', '2026-12-02');
        expect(started.ok).toBe(false);
        expect(started.message).toMatch(/already started/i);
        expect(started.message).toMatch(/HR/);
    });

    test('the first day counts as started — an employee cannot shorten on the day', () => {
        expect(rules.shortenCheck(approved, '2026-12-03', '2026-12-01').ok).toBe(false);
    });

    test('HR may shorten leave that has already started', () => {
        expect(
            rules.shortenCheck(approved, '2026-12-03', '2026-12-02', { allowStarted: true })
        ).toEqual({ ok: true });
    });

    test('HR is still bound by the range and status rules', () => {
        expect(rules.shortenCheck(approved, '2026-12-09', '2026-12-02', { allowStarted: true }).ok).toBe(false);
        expect(
            rules.shortenCheck({ ...approved, status: 'CANCELLED' }, '2026-12-03', '2026-12-02', { allowStarted: true }).ok
        ).toBe(false);
    });
});

describe('leaveRules.shortenOutcome', () => {
    test('returns only the difference in chargeable days', () => {
        expect(rules.shortenOutcome(5, 3)).toMatchObject({ daysReturned: 2, fullyCancelled: false, ok: true });
    });

    test('trimming every working day is a full withdrawal, not a shortening', () => {
        expect(rules.shortenOutcome(5, 0)).toMatchObject({ daysReturned: 5, fullyCancelled: true });
    });

    test('freeing no chargeable day is not ok (the trimmed days were weekends/holidays)', () => {
        expect(rules.shortenOutcome(3, 3)).toMatchObject({ daysReturned: 0, ok: false });
    });

    test('half-day precision survives', () => {
        expect(rules.shortenOutcome(2.5, 1).daysReturned).toBe(1.5);
        expect(rules.shortenOutcome(1, 0.5).daysReturned).toBe(0.5);
    });

    test('never reports a usable return if the numbers are inverted', () => {
        expect(rules.shortenOutcome(2, 4).ok).toBe(false);
    });

    test('missing numbers degrade to zero rather than NaN', () => {
        const res = rules.shortenOutcome(undefined, null);
        expect(res.daysReturned).toBe(0);
        expect(Number.isNaN(res.daysReturned)).toBe(false);
    });
});

/* ---------------- UC-13 (extended): certificate compliance ---------------- */

describe('leaveRules.mcComplianceGap', () => {
    const sick = (over) => ({
        leaveType: 'sick_nomc', days: 4, attachmentData: null, status: 'APPROVED', ...over
    });

    test('flags a long self-declared absence with no certificate', () => {
        const gap = rules.mcComplianceGap(sick());
        expect(gap.reason).toBe('EXCEEDS_SELF_DECLARATION');
        expect(gap.detail).toContain(String(rules.MC_REQUIRED_AFTER_DAYS));
    });

    test('a short absence within the self-declaration limit is fine', () => {
        expect(rules.mcComplianceGap(sick({ days: rules.MC_REQUIRED_AFTER_DAYS }))).toBeNull();
        expect(rules.mcComplianceGap(sick({ days: 1 }))).toBeNull();
    });

    test('a certificate on file clears it, however long the absence', () => {
        expect(rules.mcComplianceGap(sick({ days: 30, attachmentData: 'data:application/pdf;base64,AAA' }))).toBeNull();
    });

    test('a type that always requires an MC is flagged even for one day', () => {
        const gap = rules.mcComplianceGap(
            sick({ leaveType: 'sick_mc', days: 1 }),
            { code: 'sick_mc', name: 'Sick Leave (with MC)', requiresMc: true }
        );
        expect(gap.reason).toBe('TYPE_REQUIRES_MC');
    });

    test('annual leave is never a certificate problem', () => {
        expect(rules.mcComplianceGap({ leaveType: 'annual', days: 10, attachmentData: null, status: 'APPROVED' })).toBeNull();
    });

    test('withdrawn, refused and unsubmitted requests are not chased', () => {
        for (const status of ['CANCELLED', 'REJECTED', 'DRAFT']) {
            expect(rules.mcComplianceGap(sick({ status }))).toBeNull();
        }
    });

    test('a request still awaiting approval is chased — the MC is wanted before the decision', () => {
        expect(rules.mcComplianceGap(sick({ status: 'PENDING_SUPERVISOR' }))).not.toBeNull();
    });
});
