import type { Knex } from 'knex';
import type { DatabaseHealthCheck } from '../../domain/health/database-health-check';

const TIMEOUT_MS = 2000;

export class KnexDatabaseHealthCheck implements DatabaseHealthCheck {
  constructor(private readonly knex: Knex) {}

  // El límite vive aquí y no en la configuración global, para no afectar otras consultas.
  async isUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    });
    const query = this.knex.raw('SELECT 1').then(
      () => true,
      () => false,
    );

    try {
      return await Promise.race([query, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
