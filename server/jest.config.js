module.exports = {
    testEnvironment: 'node',
    // Loads .env.test before any module, so DB_NAME points at the dedicated
    // test schema and no AI key is ever present during tests.
    setupFiles: ['<rootDir>/tests/setupEnv.js'],
    // Each member's own suites live in <repo>/tests/<name>/ for submission,
    // while the shared/integration suites stay in server/tests. Both roots run
    // under one `npx jest`, so "all tests pass" means all of them.
    roots: ['<rootDir>', '<rootDir>/../tests'],
    // Those suites sit outside server/, so Node's normal upward search never
    // reaches server/node_modules. Point the resolver at it explicitly, or a
    // bare require('supertest') from tests/<name>/ cannot be resolved.
    modulePaths: ['<rootDir>/node_modules'],
    // The MySQL integration suites share one schema — run files serially so
    // fixtures from one file cannot race another.
    maxWorkers: 1,
    testTimeout: 60000,
    testPathIgnorePatterns: ['/node_modules/']
};
