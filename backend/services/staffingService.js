// M4 (UC-17 + UC-18): manpower heatmap and blackout-period checks.
//  - buildHeatmap: per-day on-duty headcount for a team over a date window,
//    colour-coded green/amber/red against the configured minimum staffing.
//  - blackoutForRange: which active blackout periods a requested range hits,
//    and the strongest mode (BLOCK wins over SPECIAL_APPROVAL).
const { Op } = require('sequelize');
const { User, LeaveRequest, MinStaffing, BlackoutPeriod, PublicHoliday } = require('../models');
const calc = require('./calculationService');
const { workingDaysFor } = require('./weekendConfigService');

const MIN_STAFFING_DEFAULT = 3;

// Resolve the minimum headcount for a team (TEAM rule first, then COUNTRY, then default).
const resolveMinHeadcount = async (team, country) => {
    const byTeam = await MinStaffing.findOne({ where: { scope: "TEAM", scopeId: team } });
    if (byTeam) return byTeam.minHeadcount;
    if (country) {
        const byCountry = await MinStaffing.findOne({ where: { scope: "COUNTRY", scopeId: country } });
        if (byCountry) return byCountry.minHeadcount;
    }
    return MIN_STAFFING_DEFAULT;
};

// on-duty headcount per working day in [startISO, endISO] for one team.
const buildHeatmap = async (team, country, startISO, endISO) => {
    const members = await User.findAll({ where: { team } });
    const memberIds = members.map((m) => m.id);
    const teamSize = members.length;

    const approved = await LeaveRequest.findAll({
        where: { employeeId: { [Op.in]: memberIds.length ? memberIds : [-1] }, status: "APPROVED" }
    });
    const off = approved.map((r) => ({ userId: r.employeeId, startDate: r.startDate, endDate: r.endDate }));

    const holidays = await PublicHoliday.findAll({ where: { country: String(country || "SG").toUpperCase() } });
    const holidaySet = new Set(holidays.map((h) => h.date));
    const workingDays = await workingDaysFor(country);

    const min = await resolveMinHeadcount(team, country);
    const isoDays = calc.workingDaysInRange(startISO, endISO, workingDays, holidaySet);

    const nameOf = (id) => members.find((m) => m.id === id)?.name || `User ${id}`;
    const cells = isoDays.map((iso) => {
        const awayIds = off
            .filter((l) => iso >= l.startDate && iso <= l.endDate)
            .map((l) => l.userId);
        const uniqueAway = [...new Set(awayIds)];
        const present = teamSize - uniqueAway.length;
        const level = present < min ? "red" : present === min ? "amber" : "green";
        return { date: iso, present, teamSize, min, level, offNames: uniqueAway.map(nameOf) };
    });

    return { team, country, teamSize, min, cells };
};

// active blackout periods that overlap a requested date range, for a country+team.
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
    if (rows.length === 0) return { hit: false, mode: null, periods: [] };
    const hasBlock = rows.some((r) => r.mode === "BLOCK");
    return {
        hit: true,
        mode: hasBlock ? "BLOCK" : "SPECIAL_APPROVAL",
        periods: rows.map((r) => ({
            id: r.id, scope: r.scope, scopeId: r.scopeId,
            startDate: r.startDate, endDate: r.endDate, mode: r.mode, reason: r.reason
        }))
    };
};

module.exports = { MIN_STAFFING_DEFAULT, resolveMinHeadcount, buildHeatmap, blackoutForRange };
