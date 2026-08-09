// M5 (AI-5): lightweight, mostly rule-based anomaly detection. Surfaces
// at-risk-of-forfeiture balances, low-utilisation (burnout) signals, request
// clustering, and recurring coverage gaps as advisory dashboard prompts. Flags
// are advisory only — HR decides what to do. No LLM required (fully offline);
// this keeps the demo deterministic and matches the app's offline-first pattern.
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance } = require('../models');
const { currentLeaveYear } = require('./leaveYearService');
const chain = require('./approvalChain');

// `year` is optional — defaults to the active leave year (same one the Staff
// Table/dashboard use), not necessarily the real calendar year. See
// services/leaveYearService for why that matters after a year-end rollover.
const detectAnomalies = async (year) => {
    const activeYear = year || await currentLeaveYear();
    const users = await User.findAll();
    const nameOf = (id) => users.find((u) => u.id === id)?.name || `User ${id}`;
    const flags = [];

    // 1. Forfeiture risk — annual remaining above the 5-day carry cap.
    const balances = await LeaveBalance.findAll({ where: { leaveType: "annual", year: activeYear } });
    for (const b of balances) {
        const rem = Number(b.entitled) + Number(b.carried) - Number(b.used);
        if (rem - 5 >= 3) {
            flags.push({
                severity: "warning",
                category: "Forfeiture risk",
                message: `${nameOf(b.userId)} has ${rem} annual day(s) left — about ${rem - 5} may be forfeited at year-end (5-day cap).`,
                userId: b.userId
            });
        }
    }

    // 2. Burnout / low utilisation — very little leave taken this year.
    for (const b of balances) {
        if (Number(b.used) <= 1 && Number(b.entitled) >= 10) {
            flags.push({
                severity: "info",
                category: "Low utilisation",
                message: `${nameOf(b.userId)} has taken ${Number(b.used)} day(s) so far — consider encouraging a break (burnout signal).`,
                userId: b.userId
            });
        }
    }

    // 3. Request clustering — 3+ requests starting on the same date across staff.
    const requests = await LeaveRequest.findAll({
        where: {
            status: { [Op.in]: [...chain.PENDING_STATUSES, "APPROVED"] },
            startDate: { [Op.gte]: `${activeYear}-01-01` }
        }
    });
    const byStart = {};
    for (const r of requests) byStart[r.startDate] = (byStart[r.startDate] || 0) + 1;
    for (const [date, count] of Object.entries(byStart)) {
        if (count >= 3) {
            flags.push({
                severity: "warning",
                category: "Request clustering",
                message: `${count} requests cluster on ${date} — check team coverage for that day.`,
                date
            });
        }
    }

    // 4. Flagged coverage gaps — requests already flagged for special approval.
    const flagged = requests.filter((r) => r.flagged &&
        chain.PENDING_STATUSES.includes(r.status));
    if (flagged.length > 0) {
        flags.push({
            severity: "warning",
            category: "Coverage gap",
            message: `${flagged.length} pending request(s) are flagged for coverage below the minimum staffing threshold.`,
        });
    }

    return {
        generatedAt: new Date().toISOString(),
        count: flags.length,
        flags,
        advisoryOnly: true
    };
};

module.exports = { detectAnomalies };
