// AI-1 (M2): offline natural-language parser tests. Pure functions, no DB, no API
// key — this is the path that runs when no LLM is configured, and the fallback
// whenever the hosted model is unreachable.
const { heuristicParse } = require('../../server/services/ai');

// Fixed reference date so every expectation is stable: Monday 10 August 2026.
const MON_10_AUG_2026 = new Date(2026, 7, 10);
const parse = (text) => heuristicParse(text, MON_10_AUG_2026);

describe('AI-1 leave type', () => {
    test('"not well" is recognised as illness (was misread as annual)', () => {
        expect(parse('not well today').leaveType).toBe('sick_nomc');
        expect(parse("I'm not feeling well, taking today off").leaveType).toBe('sick_nomc');
    });

    test('common illness wording maps to sick leave', () => {
        const cases = [
            'down with flu today',
            'having a fever, staying home today',
            'food poisoning, cannot come in today',
            'bad migraine today',
            'need to see a doctor today',
            'going to the hospital today',
        ];
        for (const c of cases) {
            expect(parse(c).leaveType).toMatch(/^sick_/);
        }
    });

    test('mentioning an MC selects the with-MC type', () => {
        expect(parse('sick today, will get an MC').leaveType).toBe('sick_mc');
        expect(parse('unwell today, doctor gave me a medical certificate').leaveType).toBe('sick_mc');
    });

    test('"no MC" wins over the bare word MC', () => {
        expect(parse('sick today but no MC').leaveType).toBe('sick_nomc');
        expect(parse("unwell today, didn't get an MC").leaveType).toBe('sick_nomc');
        expect(parse('sick leave tomorrow without a medical certificate').leaveType).toBe('sick_nomc');
    });

    test('explicit annual wording beats a stray illness word', () => {
        expect(parse('annual leave next Monday to visit my doctor').leaveType).toBe('annual');
    });

    test('dental stays annual (elective), unless illness words appear', () => {
        expect(parse('half day tomorrow afternoon for dental appointment').leaveType).toBe('annual');
        expect(parse('dental surgery tomorrow, feeling unwell').leaveType).toMatch(/^sick_/);
    });

    test('defaults to annual when nothing signals a type', () => {
        expect(parse('off next Monday').leaveType).toBe('annual');
    });
});

describe('AI-1 half-day handling', () => {
    test('"I am unwell" is NOT a half day (the "am" false positive)', () => {
        const r = parse('I am unwell today');
        expect(r.halfDay).toBe(false);
        expect(r.halfDayPeriod).toBeNull();
    });

    test('half-day wording is detected with the right half', () => {
        expect(parse('half day tomorrow afternoon')).toMatchObject({ halfDay: true, halfDayPeriod: 'PM' });
        expect(parse('half-day tomorrow morning')).toMatchObject({ halfDay: true, halfDayPeriod: 'AM' });
        expect(parse('morning off on 14 Aug')).toMatchObject({ halfDay: true, halfDayPeriod: 'AM' });
        expect(parse('afternoon off on 14 Aug')).toMatchObject({ halfDay: true, halfDayPeriod: 'PM' });
        expect(parse('taking the second half of tomorrow')).toMatchObject({ halfDay: true, halfDayPeriod: 'PM' });
    });

    test('the half can be named after the verb ("leave this afternoon")', () => {
        expect(parse('urgent leave this afternoon')).toMatchObject({ halfDay: true, halfDayPeriod: 'PM' });
        expect(parse('out tomorrow morning for a clinic visit')).toMatchObject({ halfDay: true, halfDayPeriod: 'AM' });
    });

    test('a past half-day mention does not halve a full day off', () => {
        // "sick this morning ... taking today off" is a FULL day of leave.
        const r = parse('I was sick this morning but ok now, taking today off');
        expect(r.halfDay).toBe(false);
        expect(r.leaveType).toMatch(/^sick_/);
    });

    test('a multi-day range can never be a half day', () => {
        const r = parse('half day from 20 Aug to 24 Aug');
        expect(r.halfDay).toBe(false);
        expect(r.startDate).not.toBe(r.endDate);
    });
});

describe('AI-1 dates', () => {
    test('relative days', () => {
        expect(parse('off today').startDate).toBe('2026-08-10');
        expect(parse('off tomorrow').startDate).toBe('2026-08-11');
        expect(parse('leave the day after tomorrow').startDate).toBe('2026-08-12');
    });

    test('weekday references', () => {
        expect(parse('I need next Monday off').startDate).toBe('2026-08-17');
        expect(parse('taking this Friday off').startDate).toBe('2026-08-14');
        expect(parse('off on Wednesday').startDate).toBe('2026-08-12');
    });

    test('explicit dates in several formats', () => {
        expect(parse('leave on 20 Aug').startDate).toBe('2026-08-20');
        expect(parse('leave on Aug 20').startDate).toBe('2026-08-20');
        expect(parse('leave on 20th of August').startDate).toBe('2026-08-20');
        expect(parse('leave on 2026-08-20').startDate).toBe('2026-08-20');
        expect(parse('leave on 20/8').startDate).toBe('2026-08-20');       // dd/mm, not mm/dd
        expect(parse('leave on 20/08/2026').startDate).toBe('2026-08-20');
    });

    test('date ranges', () => {
        expect(parse('annual leave from 20 Aug to 24 Aug')).toMatchObject({
            startDate: '2026-08-20', endDate: '2026-08-24',
        });
        expect(parse('leave 20-24 Aug')).toMatchObject({
            startDate: '2026-08-20', endDate: '2026-08-24',
        });
        expect(parse('off from tomorrow until Friday')).toMatchObject({
            startDate: '2026-08-11', endDate: '2026-08-14',
        });
    });

    test('durations extend the end date (was booking only the first day)', () => {
        expect(parse('taking 3 days off from 17 Aug')).toMatchObject({
            startDate: '2026-08-17', endDate: '2026-08-19',
        });
        expect(parse('annual leave for 2 days from 20 Aug')).toMatchObject({
            startDate: '2026-08-20', endDate: '2026-08-21',
        });
        expect(parse('take three days off from 17 Aug')).toMatchObject({
            startDate: '2026-08-17', endDate: '2026-08-19',
        });
        expect(parse('a week off from 17 Aug')).toMatchObject({
            startDate: '2026-08-17', endDate: '2026-08-21',   // 5 working days
        });
    });

    test('"today and tomorrow" is read as a two-day range', () => {
        expect(parse('stomach flu, out today and tomorrow')).toMatchObject({
            startDate: '2026-08-10', endDate: '2026-08-11',
        });
    });

    test('an "and" that is not a date range is ignored', () => {
        const r = parse('I am sick and need leave tomorrow');
        expect(r.startDate).toBe('2026-08-11');
        expect(r.endDate).toBe('2026-08-11');
    });

    test('illness with a duration but no date starts today', () => {
        expect(parse('flu, need 2 days')).toMatchObject({
            leaveType: 'sick_nomc', startDate: '2026-08-10', endDate: '2026-08-11',
        });
        // annual leave is never assumed to start today
        expect(parse('want 2 days of annual leave').startDate).toBeNull();
    });

    test('"next week" fills Monday to Friday', () => {
        expect(parse('I want leave next week')).toMatchObject({
            startDate: '2026-08-17', endDate: '2026-08-21',
        });
    });

    test('a recent past date stays in this year (retroactive sick leave)', () => {
        // Filed on 10 Aug for the 5th — must not roll forward to 2027.
        expect(parse('I was sick on 5 Aug, MC attached').startDate).toBe('2026-08-05');
    });

    test('a long-past month rolls to next year', () => {
        expect(parse('annual leave on 3 Feb').startDate).toBe('2027-02-03');
    });

    test('single day gets an equal end date', () => {
        const r = parse('off tomorrow');
        expect(r.endDate).toBe(r.startDate);
    });
});

describe('AI-1 reason and confidence', () => {
    test('extracts the stated purpose, not the duration', () => {
        expect(parse('I need next Monday off for a family event').reason).toBe('family event');
        expect(parse('3 days off from 17 Aug because my mother is having surgery').reason)
            .toBe('my mother is having surgery');
        // "for 2 days" is a duration, so it must not become the reason
        expect(parse('annual leave for 2 days from 20 Aug').reason).not.toMatch(/^2 days$/);
    });

    test('confidence is high for explicit dates, lower for relative, low for none', () => {
        const explicit = parse('annual leave from 20 Aug to 24 Aug for family trip');
        const relative = parse('off tomorrow');
        const vague = parse('I want leave sometime soon');
        expect(explicit.confidence).toBeGreaterThanOrEqual(0.9);
        expect(relative.confidence).toBeGreaterThan(vague.confidence);
        expect(vague.confidence).toBeLessThan(0.5);
        expect(vague.startDate).toBeNull();   // never invents a date
    });
});

describe('AI-1 output shape stays valid for the apply form', () => {
    const inputs = [
        'not well today', 'half day tomorrow pm', 'annual leave 20-24 Aug',
        'sick today no mc', 'off next week', 'gibberish with no dates at all',
        '', '   ',
    ];
    test('every field is always the right type', () => {
        for (const i of inputs) {
            const r = parse(i);
            expect(['annual', 'sick_mc', 'sick_nomc']).toContain(r.leaveType);
            expect(r.startDate === null || /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)).toBe(true);
            expect(r.endDate === null || /^\d{4}-\d{2}-\d{2}$/.test(r.endDate)).toBe(true);
            expect(typeof r.halfDay).toBe('boolean');
            expect([null, 'AM', 'PM']).toContain(r.halfDayPeriod);
            expect(typeof r.reason).toBe('string');
            expect(r.confidence).toBeGreaterThanOrEqual(0);
            expect(r.confidence).toBeLessThanOrEqual(1);
            if (r.startDate && r.endDate) expect(r.endDate >= r.startDate).toBe(true);
        }
    });
});
