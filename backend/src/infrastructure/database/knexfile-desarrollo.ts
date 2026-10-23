import path from 'node:path';
import type { Knex } from 'knex';
import { loadEnv } from '../config/env';
import { buildKnexConfig } from './knex-config';

// Única guarda de los seeds de desarrollo: cubre también los que se agreguen después.
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed:dev no se ejecuta en producción');
}

const base = buildKnexConfig(loadEnv().DATABASE_URL);

// Configuración que lee `npm run seed:dev` desde dist/: datos ficticios, nunca de producción.
const config: Knex.Config = {
  ...base,
  seeds: { ...base.seeds, directory: path.join(__dirname, 'seeds-desarrollo') },
};

export default config;
