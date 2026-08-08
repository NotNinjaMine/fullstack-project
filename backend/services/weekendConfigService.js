// M4 (UC-29): resolve a country's weekend configuration, falling back to the
// Sat-Sun default when a country has no explicit row. Used by calculationService
// callers (apply, forecast, carry-forward) to fetch the working-days map.
const { CountryWorkingDays } = require('../models');
const { DEFAULT_WORKING_DAYS } = require('./calculationService');

// Returns { mon..sun: boolean } for a country (default Sat-Sun weekend).
const workingDaysFor = async (country) => {
    const cc = String(country || "SG").toUpperCase();
    const row = await CountryWorkingDays.findOne({ where: { country: cc } });
    if (row && row.workingDays) return row.workingDays;
    return { ...DEFAULT_WORKING_DAYS };
};

module.exports = { workingDaysFor };
