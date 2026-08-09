module.exports = {
    testEnvironment: 'node',
    // Loads .env.test before any module, so DB_NAME points at the dedicated
    // test schema and no AI key is ever present during tests.
    setupFiles: ['<rootDir>/tests/setupEnv.js'],
    // The MySQL integration suites share one schema — run files serially so
    // fixtures from one file cannot race another.
    maxWorkers: 1,
    testTimeout: 60000,
    testPathIgnorePatterns: ['/node_modules/']
};
