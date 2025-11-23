module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['main.js', '!**/node_modules/**', '!**/coverage/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  verbose: true,
  collectCoverage: false, // Set to true when you want coverage reports
};
