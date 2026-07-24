// Create a user AND their leave balances in one place, so entitlement always
// follows the employee's COUNTRY policy. Used by the invitation flow (UC-24)
// and the seeder — one source of truth, no drift.
const bcrypt = require('bcryptjs');
const { User, LeaveBalance, LeavePolicy } = require('../models');
const { COUNTRY_NAME } = require('../lib/entitlement');

const initialsOf = (name) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

// Clamp a requested entitlement into [annualMin, annualMax]; default to min.
const resolveEntitlement = (policy, requested) => {
  if (requested === undefined || requested === null || requested === '') return policy.annualMin;
  const n = Number(requested);
  return Math.min(Math.max(n, policy.annualMin), policy.annualMax);
};

const createUserWithBalances = async (data, year = new Date().getFullYear()) => {
  const countryCode = (data.countryCode || 'SG').toUpperCase();
  const policy = await LeavePolicy.findOne({ where: { country: countryCode } });
  if (!policy) {
    const err = new Error(`No leave policy configured for country "${countryCode}".`);
    err.status = 400;
    throw err;
  }

  const user = await User.create({
    name: data.name,
    email: data.email,
    password: await bcrypt.hash(data.password, 10),
    role: data.role || 'EMPLOYEE',
    countryCode,
    country: COUNTRY_NAME[countryCode] || 'Singapore',
    team: data.team || 'Finance',
    initials: initialsOf(data.name),
    gender: data.gender ?? null,
    dateOfBirth: data.dateOfBirth ?? null,
    children: data.children || [],
    status: data.status || 'ACTIVE',
  });

  const entitled = resolveEntitlement(policy, data.annualEntitlement);
  const balances = await Promise.all([
    LeaveBalance.create({ userId: user.id, leaveType: 'annual', year, entitled, carried: 0, used: 0 }),
    LeaveBalance.create({ userId: user.id, leaveType: 'sick_mc', year, entitled: policy.sickMc, carried: 0, used: 0 }),
    LeaveBalance.create({ userId: user.id, leaveType: 'sick_nomc', year, entitled: policy.sickNoMc, carried: 0, used: 0 }),
  ]);

  return { user, policy, balances };
};

module.exports = { createUserWithBalances, resolveEntitlement, initialsOf };
