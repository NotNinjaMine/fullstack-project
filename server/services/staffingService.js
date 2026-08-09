// M4 (UC-18): blackout-period checks.
//  - blackoutForRange: which active blackout periods a requested range hits,
//    the strongest mode (BLOCK wins over SPECIAL_APPROVAL), and the exact
//    dates inside the range that are BLOCKed, so the caller can name them.
//
// The minimum-staffing rules and the manpower heatmap that used to live here
// were removed: coverage pressure is reported by services/coverage.js (AI-2),
// and restricted windows are now expressed only as blackout periods.
const { Op } = require('sequelize');
const { BlackoutPeriod } = require('../models');

// Every ISO date from startISO to endISO inclusive (calendar days, not working days).
const eachDay = (startISO, endISO) => {
    const out = [];
    const d = new Date(`${startISO}T00:00:00`);
    const end = new Date(`${endISO}T00:00:00`);
    while (d <= end) {
        out.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
    }
    return out;
};

// Active blackout periods that overlap a requested date range, for a country+team.
const blackoutForRange = async (country, team, startISO, endISO) => {
    const cc = String(country || "SG").toUpperCase();
    const rows = await BlackoutPeriod.findAll({
        where: {
            active: true,
            [Op.and]: [
                { startDate: { [Op.lte]: endISO } },
                { endDate: { [Op.gte]: startISO } }
            ],
            [Op.or]: [
                { scope: "COUNTRY", scopeId: cc },
                { scope: "TEAM", scopeId: team }
            ]
        }
    });
    if (rows.length === 0) return { hit: false, mode: null, periods: [], blockedDates: [] };

    const hasBlock = rows.some((r) => r.mode === "BLOCK");
    // The specific days that are hard-blocked. A range may clip only the edge
    // of a BLOCK window, so the message can say exactly which dates to change.
    const blockedDates = hasBlock
        ? eachDay(startISO, endISO).filter((iso) =>
            rows.some((r) => r.mode === "BLOCK" && iso >= r.startDate && iso <= r.endDate))
        : [];

    return {
        hit: true,
        mode: hasBlock ? "BLOCK" : "SPECIAL_APPROVAL",
        blockedDates,
        periods: rows.map((r) => ({
            id: r.id, scope: r.scope, scopeId: r.scopeId,
            startDate: r.startDate, endDate: r.endDate, mode: r.mode, reason: r.reason
        }))
    };
};

module.exports = { blackoutForRange };
