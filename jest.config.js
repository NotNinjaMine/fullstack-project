// The real Jest configuration is server/jest.config.js — it sets up the test
// environment (server/.env.test) and already covers BOTH roots: the shared
// suites in server/tests and each member's suites in <repo>/tests/<name>/.
//
// Run the suite from server/:
//     cd server && npm run seed:test && npx jest
//
// This file only exists so `npx jest` at the repo root points you there instead
// of failing with a confusing "0 tests found". It used to name frontend/ and
// backend/ directories that no longer exist, which silently ran nothing.
throw new Error(
    'Run the test suite from server/: `cd server && npx jest` ' +
    '(see server/jest.config.js — it covers server/tests and tests/<member>/).'
);
