module.exports = {
  preset: 'jest-expo',
  modulePathIgnorePatterns: ['<rootDir>/.tmp/', '<rootDir>/dist/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx)'],
  testPathIgnorePatterns: ['<rootDir>/.tmp/', '<rootDir>/dist/'],
};
