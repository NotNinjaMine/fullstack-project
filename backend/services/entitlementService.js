// M1 (UC-20): bulk yearly entitlement assignment + new-joiner pro-ration.
// Pro-ration is a pure function (unit-testable). HR previews the computed changes
// before committing; every commit writes a ConfigAuditLog row.
const { User, LeaveBalance, LeavePolicy, ConfigAuditLog } = require('../models');

// Pure: pro-rate an annual entitlement by remaining months from a start date.
// Joins on/after the 15th count as a half-month; capped at the full entitlement.
const prorateEntitlement = (fullEntitlement, startISO, year = new Date().getFullYear()) => {
    const start = new Date(startISO);
    if (isNaN(start.getTime())) return fullEntitlement;
    if (start.getFullYear() < year) return fullEntitlement;   // joined before the year — full
    if (start.getFullYear() > year) return 0;                 // joins next year — none this year

    const startMonth = start.getMonth();     // 0-11
    let monthsRemaining = 12 - startMonth;   // includes the joining month
    if (start.getDate() >= 15) monthsRemaining -= 0.5;        // half-month if joined mid-month

    const prorated = (fullEntitlement * monthsRemaining) / 12;
    return Math.round(prorated * 2) / 2;     // nearest 0.5 day
};

// Compute a preview of bulk entitlement changes for a year (no writes).
const previewBulkEntitlement = async (year) => {
    const policies = await LeavePolicy.findAll();
    const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));
    const users = await User.findAll();
    const rows = [];

    for (const user of users) {
        const policy = policyByCountry[user.country];
        if (!policy) continue;
        const existing = await LeaveBalance.findOne({
            where: { userId: user.id, leaveType: "annual", year }
        });
        const target = policy.annualMin;
        rows.push({
            userId: user.id,
            name: user.name,
            country: user.country,
            currentEntitled: existing ? Number(existing.entitled) : null,
            targetEntitled: target
        });
    }
    return { year, rows };
};

// Commit the bulk entitlement update (annual = country statutory minimum).
const commitBulkEntitlement = async (year, actorName = "HR Admin") => {
    const policies = await LeavePolicy.findAll();
    const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));
    const users = await User.findAll();
    let updated = 0;

    for (const user of users) {
        const policy = policyByCountry[user.country];
        if (!policy) continue;
        const [bal] = await LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType: "annual", year },
            defaults: { entitled: policy.annualMin, carried: 0, used: 0 }
        });
        const before = Number(bal.entitled);
        bal.entitled = policy.annualMin;
        await bal.save();
        updated++;
        await ConfigAuditLog.create({
            action: `Bulk entitlement ${year}: annual set to ${policy.annualMin}d (was ${before}d)`,
            actorName,
            entity: "leave_balances",
            entityId: String(user.id),
            before: { entitled: before },
            after: { entitled: policy.annualMin }
        });
    }
    return { year, updated };
};

module.exports = { prorateEntitlement, previewBulkEntitlement, commitBulkEntitlement };
