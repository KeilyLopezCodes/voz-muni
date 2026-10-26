/** @type {import('jest').Config} */
// Pruebas de rendimiento contra Postgres real (SPEC 43), a pedido: `npm run test:rendimiento`.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
  testMatch: ['**/*.rendimiento.test.ts'],
};
