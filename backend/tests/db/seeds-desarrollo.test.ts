import path from 'node:path';
import type { Knex } from 'knex';
import { createTestKnex } from './knex-test';

// Seeds de desarrollo compilados, como los ejecuta `npm run seed:dev`.
const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');

describe('Seeds de desarrollo (seed:dev)', () => {
  let db: Knex;

  beforeAll(async () => {
    db = createTestKnex();
    await db.migrate.rollback(undefined, true);
    await db.migrate.latest();
    // Dos ejecuciones: la segunda no debe fallar ni duplicar filas.
    await db.seed.run({ directory: seedsDesarrolloDir });
    await db.seed.run({ directory: seedsDesarrolloDir });
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function contar(tabla: string): Promise<number> {
    const [{ total }] = await db(tabla).count({ total: '*' });
    return Number(total);
  }

  it.each([
    ['dependencias', 4],
    ['categorias', 4],
    ['zonas', 6],
    ['politicas_sla', 16],
    ['calendario_laboral', 730],
  ])('%s tiene %i filas', async (tabla, esperado) => {
    expect(await contar(tabla)).toBe(esperado);
  });

  it('cada categoría apunta a su dependencia', async () => {
    const filas: { categoria: string; dependencia: string }[] = await db('categorias as c')
      .join('dependencias as d', 'd.id', 'c.dependencia_id')
      .select('c.nombre as categoria', 'd.nombre as dependencia')
      .orderBy('c.nombre');

    expect(filas).toEqual([
      { categoria: 'Agua potable', dependencia: 'Dirección de Agua Potable' },
      { categoria: 'Alumbrado público', dependencia: 'Dirección de Alumbrado Público' },
      { categoria: 'Baches', dependencia: 'Dirección de Obras' },
      { categoria: 'Recolección de basura', dependencia: 'Dirección de Servicios Públicos' },
    ]);
  });

  it('2026-04-03 es no hábil por Viernes Santo', async () => {
    const fila = await db('calendario_laboral')
      .where({ fecha: '2026-04-03' })
      .first('es_habil', 'descripcion');

    expect(fila).toEqual({ es_habil: false, descripcion: 'Viernes Santo' });
  });
});
