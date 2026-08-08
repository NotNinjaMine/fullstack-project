module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/frontend/tests'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleDirectories: ['node_modules', '<rootDir>/backend/node_modules']
};
