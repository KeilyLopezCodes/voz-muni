/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // tests/db/ necesita Postgres y corre aparte con `npm run test:db`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/db/'],
};
