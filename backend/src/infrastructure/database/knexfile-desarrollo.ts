import path from 'node:path';
import type { Knex } from 'knex';
import { loadDatabaseEnv } from '../config/env';
import { buildKnexConfig } from './knex-config';

// Único punto que bloquea en producción todos los seeds de desarrollo, incluidos los futuros.
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed:dev no se ejecuta en producción');
}

const base = buildKnexConfig(loadDatabaseEnv().DATABASE_URL);

// Igual que knexfile, pero los seeds salen de seeds-desarrollo/ (datos ficticios, SPEC 05).
const config: Knex.Config = {
  ...base,
  seeds: { ...base.seeds, directory: path.join(__dirname, 'seeds-desarrollo') },
};

export default config;
