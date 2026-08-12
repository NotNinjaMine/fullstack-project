// Jest setupFile — runs BEFORE any test module (and therefore before
// models/index.js calls dotenv) so the suite talks to the dedicated test
// schema instead of the developer's demo database.
//
// Load with override enabled so shell/development DB variables cannot win over
// the dedicated test configuration.
const path = require('path');
const fs = require('fs');

const testEnvPath = path.join(__dirname, '..', '.env.test');

if (fs.existsSync(testEnvPath)) {
    require('dotenv').config({ path: testEnvPath, override: true });
} else {
    // Fail loudly rather than silently running destructive tests against the
    // development database.
    throw new Error(
        'server/.env.test is missing. Copy server/.env.example to server/.env.test, ' +
        'point DB_NAME at a dedicated test schema (e.g. leave_test), then re-run.'
    );
}

const dbName = String(process.env.DB_NAME || '').trim();
if (!dbName || dbName.toLowerCase() === 'leave' || !/test/i.test(dbName)) {
    throw new Error(
        `Unsafe test database name "${dbName || '(missing)'}". ` +
        'Set DB_NAME in server/.env.test to a dedicated schema whose name contains "test" (for example leave_test).'
    );
}

process.env.NODE_ENV = 'test';
// The suite needs *a* signing key, not a real one — index.js and secretCrypto
// both refuse to run without APP_SECRET. Defaulting it here keeps a fresh
// checkout's `.env.test` from having to carry a secret that means nothing.
if (!String(process.env.APP_SECRET || '').trim()) {
    process.env.APP_SECRET = 'test-only-app-secret';
}
// Tests use mocked/deterministic AI paths and must never spend provider credits.
process.env.OPENAI_API_KEY = '';
process.env.OPENROUTER_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
// Automated tests must never create or use a real SMTP transport, even when a
// developer has SMTP credentials in their shell or local development file.
process.env.SMTP_ENABLED = 'false';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
