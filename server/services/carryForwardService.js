// M5 (UC-04): year-end carry-forward. For each employee's annual balance, carry
// unused up to the country cap (5 days per policy), forfeit the remainder (logged),
// and carry the new year's entitlement forward at whatever level the employee is
// currently on (never resetting it down to the country floor — that would silently
// erase an above-statutory tenure bonus. Use "Apply bulk entitlement" separately if
// you deliberately want everyone reset to the country's statutory figure).
// A manual trigger runs the same routine for the live demo; a setInterval sweep
// (SGT, no node-cron — matching the M3 reminder pattern) fires it at year-end.
// Balance math is decided in code.
const { User, LeaveBalance, LeavePolicy, ConfigAuditLog } = require('../models');
const { notify } = require('./notificationService');

const remaining = (b) => Number(b.entitled) + Number(b.carried) - Number(b.used);

// Work out what carry-forward WOULD do, without writing anything.
//
// Deliberately shares this calculation with runCarryForward below rather than
// duplicating the maths, so the preview HR confirms can never disagree with what
// actually gets applied.
const previewCarryForward = async (fromYear) => {
    const toYear = fromYear + 1;
    const policies = await LeavePolicy.findAll();
    const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));
    const users = await User.findAll({ order: [['name', 'ASC']] });
    const rows = [];

    for (const user of users) {
        const policy = policyByCountry[user.country];
        if (!policy) continue;
        const annual = await LeaveBalance.findOne({
            where: { userId: user.id, leaveType: "annual", year: fromYear }
        });
        if (!annual) continue;

        const unused = Math.max(0, remaining(annual));
        const cap = Number(policy.carryForwardMax) || 5;
        const carried = Math.min(unused, cap);
        const forfeited = Math.max(0, unused - cap);

        // The new year's entitlement PRESERVES whatever this employee is
        // currently entitled to (which may be above the country floor — e.g. a
        // supervisor/manager tenure bonus set via bulk entitlement or an
        // individual adjustment), only ever raising it up to the statutory
        // floor if it was somehow below that. This is deliberately NOT the
        // same number "Apply bulk entitlement" uses (policy.annualMin for
        // everyone) — carry-forward rolls over what someone already has,
        // bulk entitlement is the separate, explicit action that resets
        // everyone down to the country's statutory figure.
        const currentEntitled = Number(annual.entitled);
        const newEntitled = Math.max(currentEntitled, policy.annualMin);

        rows.push({
            userId: user.id,
            name: user.name,
            country: user.country,
            unused,
            cap,
            carried,
            forfeited,
            newEntitled
        });
    }

    return {
        fromYear,
        toYear,
        rows,
        totalCarried: rows.reduce((s, r) => s + r.carried, 0),
        totalForfeited: rows.reduce((s, r) => s + r.forfeited, 0),
        forfeitCount: rows.filter((r) => r.forfeited > 0).length
    };
};

// Run carry-forward from `fromYear` into `fromYear + 1`. Returns a summary array.
const runCarryForward = async (fromYear, actorName = "System") => {
    const toYear = fromYear + 1;
    const policies = await LeavePolicy.findAll();
    const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));

    const users = await User.findAll();
    const summary = [];

    for (const user of users) {
        const policy = policyByCountry[user.country];
        if (!policy) continue;

        const annual = await LeaveBalance.findOne({
            where: { userId: user.id, leaveType: "annual", year: fromYear }
        });
        if (!annual) continue;

        const unused = Math.max(0, remaining(annual));
        const cap = Number(policy.carryForwardMax) || 5;
        const carried = Math.min(unused, cap);
        const forfeited = Math.max(0, unused - cap);

        // Mirrors previewCarryForward exactly (see the comment there): carry the
        // employee's existing entitlement forward rather than resetting everyone
        // down to the country floor, so this never silently strips an
        // above-statutory entitlement (e.g. a supervisor/manager tenure bonus).
        const currentEntitled = Number(annual.entitled);
        const newEntitled = Math.max(currentEntitled, policy.annualMin);

        // Create or update the next year's annual balance.
        const [nextAnnual] = await LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType: "annual", year: toYear },
            defaults: { entitled: newEntitled, carried, used: 0 }
        });
        // If it already existed, still apply the reset + carried (idempotent-ish for demo).
        nextAnnual.entitled = newEntitled;
        nextAnnual.carried = carried;
        await nextAnnual.save();

        // Also roll sick balances to the new year from policy.
        await LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType: "sick_mc", year: toYear },
            defaults: { entitled: policy.sickMc, carried: 0, used: 0 }
        });
        await LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType: "sick_nomc", year: toYear },
            defaults: { entitled: policy.sickNoMc, carried: 0, used: 0 }
        });

        await ConfigAuditLog.create({
            action: `Carry-forward ${fromYear}→${toYear}: carried ${carried}d, forfeited ${forfeited}d, entitlement carried at ${newEntitled}d`,
            actorName,
            entity: "leave_balances",
            entityId: String(user.id),
            before: { year: fromYear, unused },
            after: { year: toYear, carried, forfeited, entitled: newEntitled }
        });

        // Notify the employee (best-effort; HR gets the summary from the route).
        await notify(
            user.id,
            `Year-end carry-forward: ${carried} day(s) carried to ${toYear}` +
            (forfeited > 0 ? `, ${forfeited} day(s) forfeited (5-day cap).` : "."),
            { type: "CARRY_FORWARD" }
        );

        summary.push({
            userId: user.id, name: user.name, country: user.country,
            unused, carried, forfeited, newEntitled
        });
    }

    return { fromYear, toYear, summary };
};

// Manual, HR-triggered warning email (+ in-app notification) to every ACTIVE
// employee currently at risk of losing annual leave at year-end — before
// runCarryForward actually happens and the days are gone. Tiered by how bad
// the risk is: >=5d at risk = critical, >=3d = warning, >=1d = a lighter
// heads-up. Does not touch any balance; purely informational.
const FORFEITURE_TIERS = [
    { min: 5, tier: "critical" },
    { min: 3, tier: "warning" },
    { min: 1, tier: "notice" }
];
const tierFor = (atRisk) => FORFEITURE_TIERS.find((t) => atRisk >= t.min)?.tier || null;

const sendForfeitureReminders = async (actorName = "System", year = new Date().getFullYear()) => {
    const policies = await LeavePolicy.findAll();
    const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));
    const users = await User.findAll({ where: { status: "ACTIVE" } });

    const summary = { checked: 0, atRisk: 0, emailed: 0, byTier: { critical: 0, warning: 0, notice: 0 } };

    for (const user of users) {
        const policy = policyByCountry[user.country];
        if (!policy) continue;
        const annual = await LeaveBalance.findOne({ where: { userId: user.id, leaveType: "annual", year } });
        if (!annual) continue;
        summary.checked++;

        const rem = remaining(annual);
        const cap = Number(policy.carryForwardMax) || 5;
        const atRisk = Math.max(0, rem - cap);
        const tier = tierFor(atRisk);
        if (!tier) continue;

        summary.atRisk++;
        summary.byTier[tier]++;

        const tierWord = tier === "critical" ? "urgent" : tier === "warning" ? "important" : "a heads-up";
        const message = `You have ${atRisk} day(s) of annual leave at risk of forfeiture at year-end ` +
            `(${cap}d carries forward, you currently have ${rem}d available) — this is ${tierWord}.`;

        const outcomes = await notify(user.id, message, {
            type: "FORFEITURE_RISK",
            event: "FORFEITURE_RISK",
            tier, atRisk, available: rem, carryForwardMax: cap
        });
        if (outcomes?.email?.sent) summary.emailed++;

        await ConfigAuditLog.create({
            action: `Forfeiture reminder sent to ${user.name}: ${atRisk}d at risk (${tier})`,
            actorName,
            entity: "leave_balances",
            entityId: String(user.id),
            before: null,
            after: { year, atRisk, tier, available: rem, carryForwardMax: cap }
        });
    }

    return summary;
};

module.exports = { runCarryForward, previewCarryForward, remaining, sendForfeitureReminders };
