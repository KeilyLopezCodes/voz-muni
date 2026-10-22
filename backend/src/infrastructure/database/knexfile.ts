import type { Knex } from 'knex';
import { loadEnv } from '../config/env';
import { buildKnexConfig } from './knex-config';

// Configuración que lee la CLI de Knex desde dist/.
const config: Knex.Config = buildKnexConfig(loadEnv().DATABASE_URL);

export default config;
