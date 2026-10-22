import path from 'node:path';
import knex, { type Knex } from 'knex';
import { buildKnexConfig } from '../../src/infrastructure/database/knex-config';

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error('DATABASE_URL_TEST no está definida; copia .env.example a .env');
}

// Migraciones y seeds compilados: se prueba el mismo artefacto que corre en producción.
const distDatabaseDir = path.resolve(__dirname, '../../dist/infrastructure/database');

export function createTestKnex(): Knex {
  const config = buildKnexConfig(databaseUrlTest!);
  return knex({
    ...config,
    migrations: { ...config.migrations, directory: path.join(distDatabaseDir, 'migrations') },
    seeds: { ...config.seeds, directory: path.join(distDatabaseDir, 'seeds') },
  });
}
