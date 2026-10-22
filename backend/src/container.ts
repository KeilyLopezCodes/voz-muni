import knex from 'knex';
import { HealthService } from './application/services/health.service';
import { SystemClock } from './infrastructure/clock/system-clock';
import { loadEnv } from './infrastructure/config/env';
import { buildKnexConfig } from './infrastructure/database/knex-config';
import { KnexDatabaseHealthCheck } from './infrastructure/database/knex-database-health-check';

export interface Container {
  port: number;
  healthService: HealthService;
  dispose(): Promise<void>;
}

// Único punto fuera de infrastructure/ que instancia sus adaptadores.
export function buildContainer(): Container {
  const env = loadEnv();
  const db = knex(buildKnexConfig(env.DATABASE_URL));
  const clock = new SystemClock();
  return {
    port: env.PORT,
    healthService: new HealthService(clock, new KnexDatabaseHealthCheck(db)),
    dispose: () => db.destroy(),
  };
}
