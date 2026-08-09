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

console.log(`Seeding TEST database "${process.env.DB_NAME}" …`);
require('../seed');
