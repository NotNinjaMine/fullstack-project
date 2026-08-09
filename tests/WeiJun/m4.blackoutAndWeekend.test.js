// M4 (Coverage, Calendar & Scheduling Rules) — the two M4 services that touch
// the database (staffingService.blackoutForRange for UC-18, and
// weekendConfigService.workingDaysFor for UC-29) are tested here the same way
// M3's notification suite mocks ../src/models: no real database, but the
// query shape and the branching logic are still exercised for real.
jest.mock('../../backend/src/models', () => ({
    BlackoutPeriod: { findAll: jest.fn() },
    CountryWorkingDays: { findOne: jest.fn() }
}));

const { Op } = require('sequelize');
const models = require('../../backend/src/models');
const { blackoutForRange } = require('../../backend/src/services/staffingService');
const { workingDaysFor } = require('../../backend/src/services/weekendConfigService');

describe('staffingService.blackoutForRange (UC-18: blackout periods)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('no active periods overlap the range -> hit is false, nothing blocked', async () => {
        models.BlackoutPeriod.findAll.mockResolvedValue([]);
        const result = await blackoutForRange('SG', 'Compliance Team A', '2026-08-10', '2026-08-14');
        expect(result).toEqual({ hit: false, mode: null, periods: [], blockedDates: [] });
    });

    test('a SPECIAL_APPROVAL period overlaps but does not hard-block any date', async () => {
        models.BlackoutPeriod.findAll.mockResolvedValue([
            { id: 1, scope: 'COUNTRY', scopeId: 'SG', startDate: '2026-08-12', endDate: '2026-08-13', mode: 'SPECIAL_APPROVAL', reason: 'Year-end close' }
        ]);
        const result = await blackoutForRange('SG', 'Compliance Team A', '2026-08-10', '2026-08-14');
        expect(result.hit).toBe(true);
        expect(result.mode).toBe('SPECIAL_APPROVAL');
        expect(result.blockedDates).toEqual([]);
    });

    test('a BLOCK period wins even when a SPECIAL_APPROVAL period also overlaps', async () => {
        models.BlackoutPeriod.findAll.mockResolvedValue([
            { id: 1, scope: 'COUNTRY', scopeId: 'SG', startDate: '2026-08-12', endDate: '2026-08-13', mode: 'SPECIAL_APPROVAL', reason: 'Year-end close' },
            { id: 2, scope: 'TEAM', scopeId: 'Compliance Team A', startDate: '2026-08-13', endDate: '2026-08-13', mode: 'BLOCK', reason: 'Client audit' }
        ]);
        const result = await blackoutForRange('SG', 'Compliance Team A', '2026-08-10', '2026-08-14');
        expect(result.mode).toBe('BLOCK');
        // Only the day actually covered by the BLOCK row is named, not the whole request.
        expect(result.blockedDates).toEqual(['2026-08-13']);
        expect(result.periods).toHaveLength(2);
    });

    test('a country is uppercased before it is used in the query filter', async () => {
        models.BlackoutPeriod.findAll.mockResolvedValue([]);
        await blackoutForRange('sg', 'Compliance Team A', '2026-08-10', '2026-08-14');
        const whereArg = models.BlackoutPeriod.findAll.mock.calls[0][0].where;
        const countryClause = whereArg[Op.or].find((c) => c.scope === 'COUNTRY');
        expect(countryClause.scopeId).toBe('SG');
    });
});

describe('weekendConfigService.workingDaysFor (UC-29: country weekend configuration)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('returns the stored config when the country has one', async () => {
        const friSat = { mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: true };
        models.CountryWorkingDays.findOne.mockResolvedValue({ country: 'AE', workingDays: friSat });
        const result = await workingDaysFor('ae');
        expect(result).toEqual(friSat);
        expect(models.CountryWorkingDays.findOne).toHaveBeenCalledWith({ where: { country: 'AE' } });
    });

    test('falls back to the Sat/Sun default when the country has no row', async () => {
        models.CountryWorkingDays.findOne.mockResolvedValue(null);
        const result = await workingDaysFor('SG');
        expect(result).toEqual({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false });
    });

    test('an empty/undefined country defaults to SG before querying', async () => {
        models.CountryWorkingDays.findOne.mockResolvedValue(null);
        await workingDaysFor(undefined);
        expect(models.CountryWorkingDays.findOne).toHaveBeenCalledWith({ where: { country: 'SG' } });
    });

    test('the fallback default is a fresh object each call, not a shared mutable reference', async () => {
        models.CountryWorkingDays.findOne.mockResolvedValue(null);
        const first = await workingDaysFor('SG');
        const second = await workingDaysFor('SG');
        first.sat = true; // mutate the first result
        expect(second.sat).toBe(false); // the second call must be unaffected
    });
});
