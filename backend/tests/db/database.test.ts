import knex, { type Knex } from 'knex';
import { buildKnexConfig } from '../../src/infrastructure/database/knex-config';
import { KnexDatabaseHealthCheck } from '../../src/infrastructure/database/knex-database-health-check';
import { createTestKnex } from './knex-test';

describe('Base de datos', () => {
  let db: Knex;

  beforeAll(() => {
    db = createTestKnex();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('ejecuta SELECT 1', async () => {
    const result = await db.raw('SELECT 1 AS uno');
    expect(result.rows).toEqual([{ uno: 1 }]);
  });

  it('usa UTC como zona horaria de sesión', async () => {
    const result = await db.raw('SHOW TIME ZONE');
    expect(result.rows[0].TimeZone).toBe('UTC');
  });

  it('migrate.latest() crea knex_migrations', async () => {
    await db.migrate.latest();
    expect(await db.schema.hasTable('knex_migrations')).toBe(true);
  });

  it('isUp() devuelve true con la base de pruebas', async () => {
    await expect(new KnexDatabaseHealthCheck(db).isUp()).resolves.toBe(true);
  });

  it('isUp() devuelve false en menos de 3 s con un puerto cerrado', async () => {
    const closed = knex(buildKnexConfig('postgres://vozmuni:vozmuni@localhost:1/vozmuni'));
    const start = Date.now();
    try {
      await expect(new KnexDatabaseHealthCheck(closed).isUp()).resolves.toBe(false);
      expect(Date.now() - start).toBeLessThan(3000);
    } finally {
      await closed.destroy();
    }
  });
});
