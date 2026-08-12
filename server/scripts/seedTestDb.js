// Seed the DEDICATED TEST schema (server/.env.test → DB_NAME=leave_test).
//
//   npm run seed:test
//
// Loads .env.test with override enabled so shell/development DB variables cannot
// win when seed.js pulls in ../models.
const path = require('path');
const fs = require('fs');

const testEnvPath = path.join(__dirname, '..', '.env.test');
if (!fs.existsSync(testEnvPath)) {
    console.error('server/.env.test not found — create it before seeding the test database.');
    process.exit(1);
}
require('dotenv').config({ path: testEnvPath, override: true });

if (!process.env.DB_NAME || process.env.DB_NAME.toLowerCase() === 'leave' || !/test/i.test(process.env.DB_NAME)) {
    console.error(
        `Refusing to seed: .env.test DB_NAME is "${process.env.DB_NAME}". ` +
        'Point it at a dedicated schema whose name contains test (e.g. leave_test) so the demo data is never clobbered.'
    );
    process.exit(1);
}

// `npm run seed:test -- --reset` drops and recreates the schema first.
//
// seed.js only upserts reference data (policies, holidays, leave types, users);
// it never clears leave_requests, comments, notifications, delegations or the
// audit log. A suite that fails partway leaves its fixtures behind, and because
// the integration suites derive fixture dates from "today", those leftovers
// eventually land on the dates a later run picks — producing a double-booking
// 400 in a test asserting something else entirely. Re-running the seed does not
// help, which makes it look like a code regression rather than stale state.
//
// Deleting rows piecemeal is not a safe alternative: sync({ alter: true }) has
// to rebuild foreign keys, and any table missed leaves orphans that block the
// ALTER. Dropping the whole schema is the only reliable reset.
const reset = process.argv.includes('--reset');

const main = async () => {
    if (reset) {
        const { Sequelize } = require('sequelize');
        const admin = new Sequelize('', process.env.DB_USER, process.env.DB_PWD, {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            dialect: 'mysql',
            logging: false
        });
        // The DB_NAME guard above has already run, so this can only ever target
        // a schema whose name contains "test".
        console.log(`Dropping and recreating "${process.env.DB_NAME}" …`);
        await admin.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
        await admin.query(`CREATE DATABASE \`${process.env.DB_NAME}\``);
        await admin.close();
    }

    console.log(`Seeding TEST database "${process.env.DB_NAME}" …`);
    require('../seed');
};

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
