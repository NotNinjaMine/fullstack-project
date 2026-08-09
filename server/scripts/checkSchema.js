// One-off schema verification for M3 tables/columns
require('dotenv').config();
const db = require('../models');

(async () => {
  console.log('--- sequelize.sync({ alter: true }) ---');
  await db.sequelize.sync({ alter: true });
  console.log('sync OK (no throw)');

  const [tables] = await db.sequelize.query('SHOW TABLES');
  const names = tables.map((r) => Object.values(r)[0]).sort();
  console.log('TABLES:', names.join(', '));
  console.log('has request_comments:', names.includes('request_comments'));
  console.log('has delegations:', names.includes('delegations'));

  const describe = async (table) => {
    const [cols] = await db.sequelize.query(`DESCRIBE \`${table}\``);
    console.log(`${table}:`, cols.map((c) => `${c.Field}:${c.Type}`).join(' | '));
    return cols.map((c) => c.Field);
  };

  const n = await describe('notifications');
  const l = await describe('leave_requests');
  await describe('request_comments');
  await describe('delegations');

  console.log('Notification.type present:', n.includes('type'));
  console.log('Notification.requestId present:', n.includes('requestId'));
  console.log('LeaveRequest.reminderSentAt present:', l.includes('reminderSentAt'));

  await db.sequelize.close();
})().catch((e) => {
  console.error('SCHEMA CHECK FAILED:', e);
  process.exit(1);
});
