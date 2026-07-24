// UC-20: bulk yearly entitlement assignment + preview. Pro-ration itself is a
// pure function in lib/entitlement.js. Every commit writes a ConfigAuditLog row.
const { User, LeaveBalance, LeavePolicy } = require('../models');
const { configAudit } = require('./audit');

const previewBulkEntitlement = async (year) => {
  const policies = await LeavePolicy.findAll();
  const policyByCode = Object.fromEntries(policies.map((p) => [p.country, p]));
  const users = await User.findAll({ where: { status: 'ACTIVE' } });
  const rows = [];

  for (const user of users) {
    const policy = policyByCode[user.countryCode];
    if (!policy) continue;
    const existing = await LeaveBalance.findOne({
      where: { userId: user.id, leaveType: 'annual', year },
    });
    rows.push({
      userId: user.id,
      name: user.name,
      country: user.countryCode,
      currentEntitled: existing ? Number(existing.entitled) : null,
      targetEntitled: policy.annualMin,
    });
  }
  return { year, rows };
};

const commitBulkEntitlement = async (year, actorName = 'HR Admin') => {
  const policies = await LeavePolicy.findAll();
  const policyByCode = Object.fromEntries(policies.map((p) => [p.country, p]));
  const users = await User.findAll({ where: { status: 'ACTIVE' } });
  let updated = 0;

  for (const user of users) {
    const policy = policyByCode[user.countryCode];
    if (!policy) continue;
    const [bal] = await LeaveBalance.findOrCreate({
      where: { userId: user.id, leaveType: 'annual', year },
      defaults: { entitled: policy.annualMin, carried: 0, used: 0 },
    });
    const before = Number(bal.entitled);
    bal.entitled = policy.annualMin;
    await bal.save();
    updated++;
    await configAudit(
      actorName,
      `Bulk entitlement ${year}: annual set to ${policy.annualMin}d (was ${before}d)`,
      'leave_balances',
      String(user.id),
      { entitled: before },
      { entitled: policy.annualMin }
    );
  }
  return { year, updated, message: `Entitlements updated for ${updated} employee(s) in ${year}.` };
};

module.exports = { previewBulkEntitlement, commitBulkEntitlement };
