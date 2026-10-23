import path from 'node:path';
import type { Knex } from 'knex';
import { createTestKnex } from './knex-test';

// Seeds compilados, igual que los ejecuta `npm run seed:dev`.
const seedsDesarrollo = {
  directory: path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo'),
  loadExtensions: ['.js'],
};

async function contar(db: Knex, tabla: string): Promise<number> {
  const [{ total }] = await db(tabla).count<{ total: string }[]>({ total: '*' });
  return Number(total);
}

describe('seeds de desarrollo', () => {
  let db: Knex;

  beforeAll(async () => {
    db = createTestKnex();
    await db.migrate.rollback(undefined, true);
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('seed:run no carga datos de desarrollo', async () => {
    await db.seed.run();

    for (const tabla of ['dependencias', 'categorias', 'zonas', 'politicas_sla', 'calendario_laboral']) {
      expect(await contar(db, tabla)).toBe(0);
    }
  });

  it('ejecutados dos veces dejan 4/4/6/16/730 filas', async () => {
    await db.seed.run(seedsDesarrollo);
    await db.seed.run(seedsDesarrollo);

    expect(await contar(db, 'dependencias')).toBe(4);
    expect(await contar(db, 'categorias')).toBe(4);
    expect(await contar(db, 'zonas')).toBe(6);
    expect(await contar(db, 'politicas_sla')).toBe(16);
    expect(await contar(db, 'calendario_laboral')).toBe(730);
  });

  it('cada categoría apunta a su dependencia', async () => {
    const filas = await db('categorias as c')
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

  it('deja coordinador_id en null y campos_extra vacío', async () => {
    expect(await db('dependencias').whereNotNull('coordinador_id').first()).toBeUndefined();
    expect(await db('categorias').whereRaw("campos_extra <> '[]'::jsonb").first()).toBeUndefined();
  });

  it('Baches / media tiene 24 h de respuesta y 72 h de resolución', async () => {
    const politica = await db('politicas_sla as p')
      .join('categorias as c', 'c.id', 'p.categoria_id')
      .where({ 'c.nombre': 'Baches', 'p.prioridad': 'media' })
      .first('p.horas_respuesta', 'p.horas_resolucion');

    expect(politica).toEqual({ horas_respuesta: 24, horas_resolucion: 72 });
  });

  it('carga el calendario con sus días hábiles y asuetos', async () => {
    const { rows } = await db.raw(`
      SELECT
        count(*) FILTER (WHERE es_habil AND extract(year FROM fecha) = 2026)::int AS habiles_2026,
        count(*) FILTER (WHERE es_habil AND extract(year FROM fecha) = 2027)::int AS habiles_2027,
        count(*) FILTER (WHERE es_habil AND extract(isodow FROM fecha) IN (6, 7))::int AS fines_de_semana_habiles
      FROM calendario_laboral
    `);
    expect(rows[0]).toEqual({ habiles_2026: 253, habiles_2027: 254, fines_de_semana_habiles: 0 });

    const viernesSanto = await db('calendario_laboral').whereRaw("fecha = '2026-04-03'").first('es_habil', 'descripcion');
    expect(viernesSanto).toEqual({ es_habil: false, descripcion: 'Viernes Santo' });

    const nochebuena = await db('calendario_laboral').whereRaw("fecha = '2026-12-24'").first('es_habil', 'descripcion');
    expect(nochebuena.es_habil).toBe(true);
    expect(nochebuena.descripcion).toContain('asueto desde mediodía');
  });

  it('respeta los cambios hechos a mano y vuelve a agregar la fila original', async () => {
    await db('zonas').where({ nombre: 'Zona 3', tipo: 'zona' }).update({ nombre: 'Zona 3 renombrada' });

    await db.seed.run(seedsDesarrollo);

    const nombres = (await db('zonas').where({ tipo: 'zona' }).pluck('nombre')).sort();
    expect(nombres).toEqual(['Zona 1', 'Zona 2', 'Zona 3', 'Zona 3 renombrada']);
  });
});
