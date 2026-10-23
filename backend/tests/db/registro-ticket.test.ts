import type { Knex } from 'knex';
import { type DatosRegistro, Ticket } from '../../src/domain/ticket/ticket';
import { KnexCatalogoLecturaRepository } from '../../src/infrastructure/repositories/knex-catalogo-lectura-repository';
import { KnexRegistroTicketRepository } from '../../src/infrastructure/repositories/knex-registro-ticket-repository';
import { createTestKnex, reiniciarEsquema } from './knex-test';

// 22 de octubre de 2026, mediodía en Guatemala.
const AHORA = new Date('2026-10-22T18:00:00.000Z');

describe('Registro de tickets con correlativo (SPEC 12)', () => {
  let db: Knex;
  let repo: KnexRegistroTicketRepository;
  let catalogo: KnexCatalogoLecturaRepository;
  let base: DatosRegistro;
  let ids: { categoria: number; categoriaInactiva: number; categoriaDeDependenciaInactiva: number; zona: number };

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
    repo = new KnexRegistroTicketRepository(db);
    catalogo = new KnexCatalogoLecturaRepository(db);

    const [activa, inactiva] = (
      await db('dependencias')
        .insert([
          { nombre: 'Obras', activa: true },
          { nombre: 'Cerrada', activa: false },
        ])
        .returning('id')
    ).map((f) => Number(f.id));
    const categorias = await db('categorias')
      .insert([
        { nombre: 'Baches', dependencia_id: activa, activa: true },
        { nombre: 'Vieja', dependencia_id: activa, activa: false },
        { nombre: 'De dependencia cerrada', dependencia_id: inactiva, activa: true },
      ])
      .returning('id');
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    const { id: rolVecino } = await db('roles').where({ nombre: 'vecino' }).first('id');
    const [vecino] = await db('usuarios').insert({ nombre: 'Vecino', telefono: '55550000', rol_id: rolVecino }).returning('id');

    ids = {
      categoria: Number(categorias[0].id),
      categoriaInactiva: Number(categorias[1].id),
      categoriaDeDependenciaInactiva: Number(categorias[2].id),
      zona: Number(zona.id),
    };
    base = {
      solicitanteId: Number(vecino.id),
      registradoPor: Number(vecino.id),
      categoriaId: ids.categoria,
      zonaId: ids.zona,
      canal: 'portal',
      titulo: 'Bache en la calle',
      descripcion: 'Hay un bache profundo frente a la escuela',
      direccion: '5a avenida 3-20, zona 1',
    };
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db('ticket_historial').delete();
    await db('tickets').delete();
    await db('correlativos').delete();
  });

  const registrar = (ahora = AHORA, actorId: number | null = base.registradoPor) =>
    repo.registrar(Ticket.registrar(base, { actorId, ahora }), () => ({}));

  it('el primer registro del año es -000001 y el segundo -000002, con su historial de creación', async () => {
    const primero = await registrar();
    const segundo = await registrar();

    expect(primero).toEqual({ id: expect.any(Number), numero: 'Q-2026-000001', creadoEn: AHORA });
    expect(segundo.numero).toBe('Q-2026-000002');

    const historial = await db('ticket_historial').where({ ticket_id: primero.id });
    expect(historial).toEqual([
      expect.objectContaining({
        estado_anterior: null,
        estado_nuevo: 'nueva',
        usuario_id: String(base.registradoPor),
        motivo: null,
      }),
    ]);
    expect(await db('tickets').where({ id: primero.id }).first()).toMatchObject({
      estado: 'nueva',
      canal: 'portal',
      datos_extra: {},
      escalado: false,
      dependencia_id: null,
      asignado_a: null,
      prioridad: null,
      lat: null,
      lng: null,
      vence_respuesta: null,
      vence_resolucion: null,
    });
  });

  it('20 registros en paralelo reciben los números del 1 al 20 sin repetir', async () => {
    const creados = await Promise.all(Array.from({ length: 20 }, () => registrar()));

    const numeros = creados.map((t) => t.numero).sort();
    expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => `Q-2026-${String(i + 1).padStart(6, '0')}`));
  });

  it('si falla el historial se revierte todo y el siguiente registro reutiliza el número', async () => {
    await registrar();

    // Un usuario_id inexistente viola la FK de ticket_historial después de tomar el número e insertar el ticket.
    await expect(registrar(AHORA, 999_999)).rejects.toMatchObject({ code: '23503' });
    expect(await db('tickets').count({ total: '*' })).toEqual([{ total: '1' }]);

    expect((await registrar()).numero).toBe('Q-2026-000002');
  });

  it('el año sale de la hora de Guatemala y cada año empieza en 000001', async () => {
    // 31/12/2026 a las 23:30 en Guatemala = 01/01/2027 05:30 UTC.
    expect((await registrar(new Date('2027-01-01T05:30:00Z'))).numero).toBe('Q-2026-000001');
    expect((await registrar(new Date('2027-01-01T06:00:00Z'))).numero).toBe('Q-2027-000001');
  });

  it('el año 999999 agotado lanza CORRELATIVO_AGOTADO sin crear el ticket', async () => {
    await db('correlativos').insert({ anio: 2026, ultimo: 999_999 });

    await expect(registrar()).rejects.toMatchObject({ codigo: 'CORRELATIVO_AGOTADO' });
    expect(await db('tickets').count({ total: '*' })).toEqual([{ total: '0' }]);
  });

  it('detecta categorías inactivas, de dependencia inactiva y zonas inexistentes', async () => {
    expect(await catalogo.categoriaRegistrable(ids.categoria)).toBe(true);
    expect(await catalogo.categoriaRegistrable(ids.categoriaInactiva)).toBe(false);
    expect(await catalogo.categoriaRegistrable(ids.categoriaDeDependenciaInactiva)).toBe(false);
    expect(await catalogo.categoriaRegistrable(999_999)).toBe(false);
    expect(await catalogo.zonaExiste(ids.zona)).toBe(true);
    expect(await catalogo.zonaExiste(999_999)).toBe(false);
  });
});
