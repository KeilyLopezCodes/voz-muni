/** @type {import('jest').Config} */
// Pruebas contra Postgres real: requieren `docker compose up -d` y DATABASE_URL_TEST.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
  // Las de rendimiento (SPEC 43) cargan cientos de miles de filas: corren a pedido con `npm run test:rendimiento`.
  testPathIgnorePatterns: ['/node_modules/', '\.rendimiento\.test\.ts$'],
};
