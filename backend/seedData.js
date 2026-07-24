// Reusable seeding logic (no process side-effects), shared by the CLI seeder
// (seed.js) and the self-booting test harness (tests/smoke.mjs).
const bcrypt = require('bcryptjs');
const db = require('./models');
const { LEAVE_POLICIES } = require('./lib/entitlement');

const { User, LeavePolicy, LeaveBalance, UserSession, SecurityEvent, Announcement } = db;

const YEAR = new Date().getFullYear();

const USERS = [
  { name: 'Wei Ling Tan', email: 'weiling@innovare.com', role: 'EMPLOYEE', team: 'Finance', countryCode: 'SG', country: 'Singapore', initials: 'WT', gender: 'F', dateOfBirth: '1996-04-12', children: [], phone: '+65 9123 4561' },
  { name: 'Priya Sharma', email: 'priya@innovare.com', role: 'EMPLOYEE', team: 'Finance', countryCode: 'SG', country: 'Singapore', initials: 'PS', gender: 'F', dateOfBirth: '1998-11-02', children: [{ name: 'Aarav', dob: '2019-08-15' }], phone: '+65 9123 4562' },
  { name: 'Kumar Rajan', email: 'kumar@innovare.com', role: 'EMPLOYEE', team: 'Finance', countryCode: 'SG', country: 'Singapore', initials: 'KR', gender: 'M', dateOfBirth: '1994-07-08', children: [{ name: 'Meera', dob: '2015-02-10' }], completedNS: true, phone: '+65 9123 4563', notifyInApp: false },
  { name: 'Marcus Lee', email: 'marcus@innovare.com', role: 'SUPERVISOR', team: 'Finance', countryCode: 'SG', country: 'Singapore', initials: 'ML', gender: 'M', dateOfBirth: '1985-09-15', children: [], completedNS: true, phone: '+65 9123 4564' },
  { name: 'Diana Ho', email: 'diana@innovare.com', role: 'MANAGER', team: 'Finance', countryCode: 'SG', country: 'Singapore', initials: 'DH', gender: 'F', dateOfBirth: '1982-01-30', children: [], phone: '+65 9123 4565' },
  { name: 'Aisha Rahman', email: 'hr@innovare.com', role: 'HR_ADMIN', team: 'People & Culture', countryCode: 'SG', country: 'Singapore', initials: 'AR', gender: 'F', dateOfBirth: '1988-03-21', children: [], phone: '+65 9123 4566' },
];

// Matches client/src/mocks/data.js BALANCES_BY_USER (annual/sick rows).
const BALANCES = {
  'weiling@innovare.com': [['annual', 14, 3, 2], ['sick_mc', 14, 0, 0], ['sick_nomc', 2, 0, 0]],
  'priya@innovare.com': [['annual', 14, 0, 5], ['sick_mc', 14, 0, 1], ['sick_nomc', 2, 0, 0]],
  'kumar@innovare.com': [['annual', 14, 1, 6], ['sick_mc', 14, 0, 0], ['sick_nomc', 2, 0, 1]],
};

// Populates a freshly-synced database. Caller owns sync({force:true}).
async function seed({ log = () => {} } = {}) {
  for (const p of LEAVE_POLICIES) {
    await LeavePolicy.findOrCreate({ where: { country: p.country }, defaults: p });
  }
  log(`Seeded ${LEAVE_POLICIES.length} country policies.`);

  const password = await bcrypt.hash('demo123!', 10);
  const byEmail = {};
  for (const u of USERS) {
    const [user] = await User.findOrCreate({ where: { email: u.email }, defaults: { ...u, password } });
    byEmail[u.email] = user;
    for (const [leaveType, entitled, carried, used] of BALANCES[u.email] || []) {
      await LeaveBalance.findOrCreate({
        where: { userId: user.id, leaveType, year: YEAR },
        defaults: { entitled, carried, used },
      });
    }
  }
  log(`Seeded ${USERS.length} users (password: demo123!).`);

  const weiling = byEmail['weiling@innovare.com'];
  await UserSession.bulkCreate([
    { userId: weiling.id, tokenHash: 'seed-a', deviceInfo: 'Chrome on macOS', ipAddress: '203.0.113.4', lastActive: new Date() },
    { userId: weiling.id, tokenHash: 'seed-b', deviceInfo: 'Safari on iPhone', ipAddress: '203.0.113.9', lastActive: new Date(Date.now() - 86400000) },
  ]);
  await SecurityEvent.bulkCreate([
    { userId: weiling.id, eventType: 'LOGIN', ipAddress: '203.0.113.4', success: true },
    { userId: weiling.id, eventType: 'FAILED_LOGIN', ipAddress: '198.51.100.7', success: false },
  ]);

  await Announcement.bulkCreate([
    { title: 'Scheduled maintenance this weekend', body: 'The Leave Management System will be briefly unavailable on Saturday 01:00–02:00 SGT for scheduled maintenance.', targetType: 'ALL', targetValue: null, startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31`, requiresAck: false, createdByName: 'Aisha Rahman', active: true },
    { title: 'New leave policy acknowledgement required', body: 'Please review and acknowledge the updated annual-leave carry-forward policy (capped at 5 days) before continuing.', targetType: 'ROLE', targetValue: 'EMPLOYEE', startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31`, requiresAck: true, createdByName: 'Aisha Rahman', active: true },
  ]);
}

module.exports = { seed };
