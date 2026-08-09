// M2 (Employee Leave Experience) pure-function unit tests — no DB, run under jest
// like the M3/M4/M5 tests: `npm test` in server/.
const rules = require('../services/leaveRules');
const { buildIcs, addOneDay, escapeText } = require('../services/icsService');

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
