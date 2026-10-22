/** @type {import('jest').Config} */
// Pruebas contra Postgres real: requieren `docker compose up -d` y DATABASE_URL_TEST.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
};
