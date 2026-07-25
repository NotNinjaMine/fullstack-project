// Provisioning: create a user AND their leave balances in one place, so the
// entitlement always follows the employee's COUNTRY policy (leave_policies).
// Used by /user/register, the Supervisor/Manager "add employee" endpoint,
// and the seeder — one source of truth, no drift.
const bcrypt = require('bcrypt');
const { User, LeaveBalance, LeavePolicy } = require('../models');

const initialsOf = (name) =>
    name.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();

// Clamp a requested entitlement into the country's [annualMin, annualMax].
// If none requested, default to the statutory minimum for that country.
const resolveEntitlement = (policy, requested) => {
    if (requested === undefined || requested === null || requested === "") {
        return policy.annualMin;
    }
    const n = Number(requested);
    return Math.min(Math.max(n, policy.annualMin), policy.annualMax);
};

/**
 * Create a user + their annual/sick balances for `year` per their country policy.
 * @param {object} data  { name, email, password (plain), role, country, team, annualEntitlement?, carried? }
 * @returns {{ user, policy, balances }}
 * @throws  Error with .status if the country has no policy configured
 */
const createUserWithBalances = async (data, year = new Date().getFullYear()) => {
    const country = (data.country || "SG").toUpperCase();
    const policy = await LeavePolicy.findOne({ where: { country } });
    if (!policy) {
        const err = new Error(`No leave policy configured for country "${country}".`);
        err.status = 400;
        throw err;
    }

    const user = await User.create({
        name: data.name,
        email: data.email,
        password: await bcrypt.hash(data.password, 10),
        role: data.role || "EMPLOYEE",
        country,
        team: data.team || "Compliance Team A",
        initials: initialsOf(data.name)
    });

    const entitled = resolveEntitlement(policy, data.annualEntitlement);
    const balances = await Promise.all([
        LeaveBalance.create({ userId: user.id, leaveType: "annual", year, entitled, carried: Number(data.carried) || 0, used: 0 }),
        LeaveBalance.create({ userId: user.id, leaveType: "sick_mc", year, entitled: policy.sickMc, carried: 0, used: 0 }),
        LeaveBalance.create({ userId: user.id, leaveType: "sick_nomc", year, entitled: policy.sickNoMc, carried: 0, used: 0 })
    ]);

    return { user, policy, balances };
};

module.exports = { createUserWithBalances, resolveEntitlement, initialsOf };
