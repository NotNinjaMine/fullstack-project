// M5 (UC-22): reporting suite. Pre-defined analytics queries returning chart+table
// shapes, plus CSV export (no new dependency — CSV is assembled in code). PDF export
// in the prototype is delivered as a print-friendly HTML the browser saves as PDF,
// so no PDF library is added. Report scope respects the caller's role visibility.
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance, LeavePolicy } = require('../models');
const { currentLeaveYear } = require('./leaveYearService');
const chain = require('./approvalChain');
const { remainingDays, daysAtRisk, capForPolicy, DEFAULT_CARRY_FORWARD_MAX } = require('./leaveEligibility');

const COUNTRY_NAME = {
    SG: "Singapore", TH: "Thailand", CN: "China", ID: "Indonesia", JP: "Japan",
    MY: "Malaysia", MM: "Myanmar", NZ: "New Zealand", PH: "Philippines", VN: "Vietnam"
};

// Resolve the set of user ids a caller may see (UC-08 visibility).
const visibleUserIds = async (caller) => {
    // HR Admin sees everyone for compliance reporting; the Boss sees everyone
    // because they sit above every team, and a report scoped to the one team
    // their directory record happens to name would be misleading.
    if (caller.role === "HR_ADMIN" || caller.role === "BOSS") {
        const all = await User.findAll({ attributes: ["id"] });
        return all.map((u) => u.id);
    }
    // SUPERVISOR / MANAGER / HOD → own team (prototype scopes by team).
    const team = await User.findAll({ where: { team: caller.team }, attributes: ["id"] });
    return team.map((u) => u.id);
};

// Leave utilisation grouped by country (approved annual days YTD).
const leaveUtilisationByCountry = async (ids, year = new Date().getFullYear()) => {
    const users = await User.findAll({ where: { id: { [Op.in]: ids.length ? ids : [-1] } } });
    const userCountry = Object.fromEntries(users.map((u) => [u.id, u.country]));
    const approved = await LeaveRequest.findAll({
        where: {
            employeeId: { [Op.in]: ids.length ? ids : [-1] },
            status: "APPROVED",
            startDate: { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` }
        }
    });
    const totals = {};
    for (const r of approved) {
        const cc = userCountry[r.employeeId] || "??";
        totals[cc] = (totals[cc] || 0) + Number(r.days);
    }
    const table = Object.entries(totals)
        .map(([cc, days]) => ({ country: cc, countryName: COUNTRY_NAME[cc] || cc, days }))
        .sort((a, b) => b.days - a.days);
    return {
        title: `Leave utilisation by country (${year})`,
        chart: { type: "bar", x: table.map((t) => t.country), y: table.map((t) => t.days) },
        table
    };
};

// Sick-leave trend by type (approved sick_mc vs sick_nomc counts).
const sickLeaveTrend = async (ids, year = new Date().getFullYear()) => {
    const rows = await LeaveRequest.findAll({
        where: {
            employeeId: { [Op.in]: ids.length ? ids : [-1] },
            status: "APPROVED",
            leaveType: { [Op.in]: ["sick_mc", "sick_nomc"] },
            startDate: { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` }
        }
    });
    let withMc = 0, noMc = 0;
    for (const r of rows) {
        if (r.leaveType === "sick_mc") withMc += Number(r.days);
        else noMc += Number(r.days);
    }
    return {
        title: `Sick-leave trend (${year})`,
        chart: { type: "bar", x: ["With MC", "Without MC"], y: [withMc, noMc] },
        table: [
            { category: "Sick leave with MC", days: withMc },
            { category: "Sick leave without MC", days: noMc }
        ]
    };
};

// Carry-forward risk: employees with unused annual balance at risk of forfeiture.
const carryForwardSummary = async (ids, year = new Date().getFullYear()) => {
    const balances = await LeaveBalance.findAll({
        where: { userId: { [Op.in]: ids.length ? ids : [-1] }, leaveType: "annual", year }
    });
    const users = await User.findAll({ where: { id: { [Op.in]: ids.length ? ids : [-1] } } });
    const nameOf = (id) => users.find((u) => u.id === id)?.name || `User ${id}`;

    // The cap is per country. This used to be a hard-coded 5 here, so on any
    // country configured differently this report and the forfeiture reminder
    // email quoted different numbers for the same employee.
    const policies = await LeavePolicy.findAll();
    const capByCountry = Object.fromEntries(policies.map((p) => [p.country, capForPolicy(p)]));
    const capFor = (userId) => {
        const country = users.find((u) => u.id === userId)?.country;
        return capByCountry[country] ?? DEFAULT_CARRY_FORWARD_MAX;
    };

    const table = balances
        .map((b) => ({
            userId: b.userId,
            name: nameOf(b.userId),
            remaining: remainingDays(b),
            willForfeit: daysAtRisk(b, capFor(b.userId))
        }))
        .filter((r) => r.remaining > 0)
        .sort((a, b) => b.willForfeit - a.willForfeit);

    // Only name a single cap in the title when every employee in scope shares
    // one; a mixed-country report would otherwise mislabel half its own rows.
    const caps = new Set(balances.map((b) => capFor(b.userId)));
    const capLabel = caps.size === 1 ? `${[...caps][0]}-day cap` : "per-country cap";
    return {
        title: `Carry-forward summary (${year}, ${capLabel})`,
        chart: { type: "bar", x: table.map((t) => t.name), y: table.map((t) => t.willForfeit) },
        table
    };
};

// Pending overview: pending counts by tier.
const pendingOverview = async (ids) => {
    const rows = await LeaveRequest.findAll({
        where: {
            employeeId: { [Op.in]: ids.length ? ids : [-1] },
            status: { [Op.in]: chain.PENDING_STATUSES }
        }
    });
    // Three tiers now: Supervisor, Manager, and the Boss (who decides Managers'
    // own leave) - see services/approvalChain.js.
    let sup = 0, mgr = 0, boss = 0;
    for (const r of rows) {
        if (r.status === "PENDING_SUPERVISOR") sup++;
        else if (r.status === "PENDING_BOSS") boss++;
        else mgr++;
    }
    return {
        title: "Pending requests overview",
        chart: { type: "bar", x: ["Awaiting Supervisor", "Awaiting Manager", "Awaiting Boss"], y: [sup, mgr, boss] },
        table: [
            { tier: "Awaiting Supervisor", count: sup },
            { tier: "Awaiting Manager", count: mgr },
            { tier: "Awaiting Boss", count: boss }
        ]
    };
};

const REPORTS = {
    leave_utilisation: leaveUtilisationByCountry,
    sick_leave_trend: sickLeaveTrend,
    carry_forward_summary: carryForwardSummary,
    pending_overview: pendingOverview
};

// Run a report by key, scoped to the caller's visible users.
const runReport = async (reportType, caller) => {
    const fn = REPORTS[reportType];
    if (!fn) {
        const err = new Error(`Unknown report type "${reportType}".`);
        err.status = 400;
        throw err;
    }
    const ids = await visibleUserIds(caller);
    // carryForwardSummary is BALANCE-based, so it must track the active leave
    // year (same one the Staff Table/dashboard use) — otherwise it would keep
    // showing last year's balances for months after HR runs a year-end
    // rollover. leaveUtilisationByCountry/sickLeaveTrend are about leave
    // actually TAKEN within a real calendar year, so they intentionally keep
    // their own real-calendar-year default instead.
    if (reportType === "carry_forward_summary") {
        return fn(ids, await currentLeaveYear());
    }
    return fn(ids);
};

// Build a CSV string from a report's table (no dependency).
const reportToCsv = (report) => {
    const rows = report.table || [];
    if (rows.length === 0) return `${report.title}\n(no data)\n`;
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        report.title,
        headers.join(","),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))
    ];
    return lines.join("\n") + "\n";
};

module.exports = {
    runReport, reportToCsv, visibleUserIds, REPORTS,
    // Exported individually so the AI-4 query catalogue can call a specific
    // pre-defined query directly (still no free SQL — fixed functions only).
    leaveUtilisationByCountry, sickLeaveTrend, carryForwardSummary, pendingOverview
};
