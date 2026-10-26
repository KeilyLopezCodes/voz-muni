import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { Ticket } from '../../src/domain/ticket/ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

describe('Asignación de técnico (SPEC 20)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    const [agua] = await db('dependencias').insert({ nombre: 'Agua Potable' }).returning('id');
    ids.obras = Number(obras.id);
    ids.agua = Number(agua.id);
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    const [fugas] = await db('categorias').insert({ nombre: 'Fugas', dependencia_id: ids.agua }).returning('id');
    ids.baches = Number(baches.id);
    ids.fugas = Number(fugas.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null, boolean][] = [
      ['coordinador', 'coordinador', ids.obras, true],
      ['coordinadorAgua', 'coordinador', ids.agua, true],
      ['supervisor', 'supervisor', null, true],
      ['receptor', 'receptor', null, true],
      ['administrador', 'administrador', null, true],
      ['vecino', 'vecino', null, true],
      ['tecnicoA1', 'tecnico', ids.obras, true],
      ['tecnicoA2', 'tecnico', ids.obras, true],
      ['tecnicoInactivo', 'tecnico', ids.obras, false],
      ['tecnicoB', 'tecnico', ids.agua, true],
    ];
    for (const [clave, rol, dependenciaId, activo] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@asignacion.test`,
          telefono: '55554321',
          dpi: clave === 'vecino' ? '2547123450101' : null,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
          activo,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      if (activo) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: `${clave.toLowerCase()}@asignacion.test`, password: PASSWORD });
        tokens[clave] = res.body.accessToken;
      }
    }
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  interface OpcionesTicket {
    estado?: EstadoTicket;
    dependencia?: 'obras' | 'agua';
    prioridad?: string;
    asignadoA?: number | null;
    creadoEn?: Date;
  }

  // Inserta directamente un ticket ya aceptado por el triage (SPEC 19).
  async function ticket({
    estado = 'asignada',
    dependencia = 'obras',
    prioridad = 'media',
    asignadoA = null,
    creadoEn = new Date(),
  }: OpcionesTicket = {}): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: dependencia === 'obras' ? ids.baches : ids.fugas,
        dependencia_id: dependencia === 'obras' ? ids.obras : ids.agua,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad,
        asignado_a: asignadoA,
        creado_en: creadoEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  const asignar = (id: number, cuerpo: object, quien = 'coordinador') =>
    request(app).patch(`/api/v1/tickets/${id}/asignacion`).set('Authorization', `Bearer ${tokens[quien]}`).send(cuerpo);
  const porAsignar = (query = '', quien = 'coordinador') =>
    request(app).get(`/api/v1/tickets/por-asignar${query}`).set('Authorization', `Bearer ${tokens[quien]}`);
  const tecnicos = (dependenciaId: number, quien = 'coordinador') =>
    request(app).get(`/api/v1/dependencias/${dependenciaId}/tecnicos`).set('Authorization', `Bearer ${tokens[quien]}`);
  const filas = (ticketId: number) =>
    db('ticket_asignaciones')
      .where({ ticket_id: ticketId })
      .orderBy('id')
      .select('tecnico_anterior', 'tecnico_nuevo', 'asignado_por', 'motivo');

  // Primero, con la base sin otros tickets: la bandeja se compara completa.
  describe('GET /tickets/por-asignar', () => {
    const t: Record<string, number> = {};
    const hace = (horas: number) => new Date(Date.now() - horas * 3600_000);

    beforeAll(async () => {
      t.bajaVieja = await ticket({ prioridad: 'baja', creadoEn: hace(50) });
      t.urgente = await ticket({ prioridad: 'urgente', creadoEn: hace(1) });
      t.altaVieja = await ticket({ prioridad: 'alta', creadoEn: hace(30) });
      t.altaNueva = await ticket({ prioridad: 'alta', creadoEn: hace(2) });
      t.conTecnico = await ticket({ prioridad: 'urgente', asignadoA: ids.tecnicoA1, creadoEn: hace(10) });
      t.enProceso = await ticket({ estado: 'en_proceso', prioridad: 'media', asignadoA: ids.tecnicoA1, creadoEn: hace(5) });
      t.enEspera = await ticket({ estado: 'en_espera', prioridad: 'baja', asignadoA: ids.tecnicoA2, creadoEn: hace(4) });
      t.resuelta = await ticket({ estado: 'resuelta', prioridad: 'urgente', asignadoA: ids.tecnicoA2 });
      t.agua = await ticket({ dependencia: 'agua', prioridad: 'urgente', creadoEn: hace(3) });
    });

    it('sin_tecnico (por defecto) lista las asignadas sin técnico de su dependencia, por prioridad y antigüedad', async () => {
      const res = await porAsignar();

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ pagina: 1, tamano: 20, total: 4 });
      expect(res.body.datos.map((d: { id: number }) => d.id)).toEqual([t.urgente, t.altaVieja, t.altaNueva, t.bajaVieja]);
      expect(res.body.datos[0]).toEqual({
        id: t.urgente,
        numero: expect.stringMatching(/^Q-2026-\d{6}$/),
        estado: 'asignada',
        prioridad: 'urgente',
        titulo: 'Bache frente a la escuela',
        categoria: { id: ids.baches, nombre: 'Baches' },
        dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
        zona: { id: ids.zona, nombre: 'Zona 1', tipo: 'zona' },
        tecnico: null,
        creadoEn: expect.stringMatching(/Z$/),
        // Insertada sin aceptar por el triage: sin vencimientos (SPEC 30).
        sla: { venceRespuesta: null, primeraRespuestaEn: null, venceResolucion: null, pausado: false, restanteMinutosEnPausa: null, escalado: false, escaladoEn: null, escaladoPor: null },
      });
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain('vecino@asignacion.test');
      expect(texto).not.toContain('55554321');
      expect(texto).not.toContain('2547123450101');
    });

    it('abiertas incluye en_proceso y en_espera con su técnico, y deja fuera resuelta', async () => {
      const res = await porAsignar('?vista=abiertas');

      expect(res.body.total).toBe(7);
      const ordenados = res.body.datos.map((d: { id: number }) => d.id);
      expect(ordenados).toEqual([
        t.conTecnico,
        t.urgente,
        t.altaVieja,
        t.altaNueva,
        t.enProceso,
        t.bajaVieja,
        t.enEspera,
      ]);
      expect(res.body.datos.find((d: { id: number }) => d.id === t.enProceso).tecnico).toEqual({
        id: ids.tecnicoA1,
        nombre: 'Usuario tecnicoA1',
      });
    });

    it('el supervisor ve todas las dependencias, y la paginación respeta el orden', async () => {
      const res = await porAsignar('', 'supervisor');
      expect(res.body.datos.map((d: { id: number }) => d.id)).toEqual([
        t.agua,
        t.urgente,
        t.altaVieja,
        t.altaNueva,
        t.bajaVieja,
      ]);

      const pagina2 = await porAsignar('?pagina=2&tamano=2', 'supervisor');
      expect(pagina2.body).toMatchObject({ pagina: 2, tamano: 2, total: 5 });
      expect(pagina2.body.datos.map((d: { id: number }) => d.id)).toEqual([t.altaVieja, t.altaNueva]);
    });

    it.each(['?vista=todas', '?tamano=51', '?pagina=0', '?otro=1'])('%s → 400', async (query) => {
      expect((await porAsignar(query)).status).toBe(400);
    });

    it('dependencias/:id/tecnicos devuelve los activos con su carga, del menos cargado al más', async () => {
      const res = await tecnicos(ids.obras);

      expect(res.status).toBe(200);
      // tecnicoA1: conTecnico + enProceso. tecnicoA2: enEspera (resuelta no cuenta). El inactivo no aparece.
      expect(res.body).toEqual([
        { id: ids.tecnicoA2, nombre: 'Usuario tecnicoA2', carga: 1 },
        { id: ids.tecnicoA1, nombre: 'Usuario tecnicoA1', carga: 2 },
      ]);
    });

    it('el coordinador que pide otra dependencia recibe 404; el supervisor puede pedirla', async () => {
      const otra = await tecnicos(ids.agua);
      expect(otra.status).toBe(404);
      expect(otra.body.codigo).toBe('NO_ENCONTRADO');

      expect((await tecnicos(ids.agua, 'supervisor')).body).toEqual([
        { id: ids.tecnicoB, nombre: 'Usuario tecnicoB', carga: 0 },
      ]);
    });
  });

  it('el coordinador asigna un técnico de su dependencia: 200, el estado no cambia y queda una fila', async () => {
    const id = await ticket();

    const res = await asignar(id, { tecnicoId: ids.tecnicoA1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-2026-\d{6}$/),
      estado: 'asignada',
      asignadoA: ids.tecnicoA1,
      tecnicoAnterior: null,
    });
    expect(await db('tickets').where({ id }).first('estado', 'asignado_a')).toEqual({
      estado: 'asignada',
      asignado_a: String(ids.tecnicoA1),
    });
    expect(await filas(id)).toEqual([
      { tecnico_anterior: null, tecnico_nuevo: String(ids.tecnicoA1), asignado_por: String(ids.coordinador), motivo: null },
    ]);
    expect(await db('ticket_historial').where({ ticket_id: id })).toEqual([]);
  });

  it('reasignar sin motivo → 400 MOTIVO_REQUERIDO; con motivo → 200 y guarda el anterior', async () => {
    const id = await ticket({ asignadoA: ids.tecnicoA1 });

    const sinMotivo = await asignar(id, { tecnicoId: ids.tecnicoA2 });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.codigo).toBe('MOTIVO_REQUERIDO');
    expect((await asignar(id, { tecnicoId: ids.tecnicoA2, motivo: '   ' })).body.codigo).toBe('MOTIVO_REQUERIDO');

    const res = await asignar(id, { tecnicoId: ids.tecnicoA2, motivo: '  El técnico está de vacaciones ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ asignadoA: ids.tecnicoA2, tecnicoAnterior: ids.tecnicoA1 });
    expect(await filas(id)).toEqual([
      {
        tecnico_anterior: String(ids.tecnicoA1),
        tecnico_nuevo: String(ids.tecnicoA2),
        asignado_por: String(ids.coordinador),
        motivo: 'El técnico está de vacaciones',
      },
    ]);
  });

  it('en en_proceso la reasignación mantiene el estado', async () => {
    const id = await ticket({ estado: 'en_proceso', asignadoA: ids.tecnicoA1 });

    const res = await asignar(id, { tecnicoId: ids.tecnicoA2, motivo: 'Carga alta' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_proceso');
    expect(await db('tickets').where({ id }).first('estado')).toEqual({ estado: 'en_proceso' });
  });

  it.each([
    ['un técnico de otra dependencia', 'tecnicoB', 'TECNICO_NO_ELEGIBLE'],
    ['un técnico inactivo', 'tecnicoInactivo', 'TECNICO_NO_ELEGIBLE'],
    ['un coordinador', 'coordinador', 'TECNICO_NO_ELEGIBLE'],
  ])('%s → 400 %s', async (_caso, quien, codigo) => {
    const id = await ticket();

    const res = await asignar(id, { tecnicoId: ids[quien] });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
    expect(await filas(id)).toEqual([]);
  });

  it('un usuario inexistente → 400 TECNICO_NO_ELEGIBLE, y el mismo técnico → 400 TECNICO_SIN_CAMBIO', async () => {
    const id = await ticket({ asignadoA: ids.tecnicoA1 });

    expect((await asignar(id, { tecnicoId: 999999, motivo: 'x' })).body.codigo).toBe('TECNICO_NO_ELEGIBLE');
    const mismo = await asignar(id, { tecnicoId: ids.tecnicoA1, motivo: 'otra vez' });
    expect(mismo.status).toBe(400);
    expect(mismo.body.codigo).toBe('TECNICO_SIN_CAMBIO');
  });

  it.each<EstadoTicket>(['resuelta', 'en_espera', 'cerrada'])('en %s → 400 OPERACION_NO_PERMITIDA', async (estado) => {
    const id = await ticket({ estado });

    const res = await asignar(id, { tecnicoId: ids.tecnicoA1 });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('OPERACION_NO_PERMITIDA');
  });

  it.each([
    ['falta tecnicoId', {}],
    ['tecnicoId en texto', { tecnicoId: '5' }],
    ['un campo de más', { tecnicoId: 5, estado: 'en_proceso' }],
    ['un motivo de 1001 caracteres', { tecnicoId: 5, motivo: 'a'.repeat(1001) }],
  ])('%s → 400 VALIDACION', async (_caso, cuerpo) => {
    const id = await ticket();

    const res = await asignar(id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDACION');
  });

  it('una queja de otra dependencia, para el coordinador → 404; el supervisor asigna allí → 200', async () => {
    const id = await ticket({ dependencia: 'agua' });

    const ajena = await asignar(id, { tecnicoId: ids.tecnicoB });
    expect(ajena.status).toBe(404);
    expect(ajena.body.codigo).toBe('NO_ENCONTRADO');

    const supervisor = await asignar(id, { tecnicoId: ids.tecnicoB }, 'supervisor');
    expect(supervisor.status).toBe(200);
    expect((await filas(id))[0].asignado_por).toBe(String(ids.supervisor));
  });

  it('el supervisor tampoco asigna técnicos de otra dependencia', async () => {
    const id = await ticket({ dependencia: 'agua' });

    expect((await asignar(id, { tecnicoId: ids.tecnicoA1 }, 'supervisor')).body.codigo).toBe('TECNICO_NO_ELEGIBLE');
  });

  it.each(['tecnicoA1', 'receptor', 'vecino', 'administrador'])('el %s recibe 403 en los 3 endpoints', async (quien) => {
    const id = await ticket();

    expect((await asignar(id, { tecnicoId: ids.tecnicoA2 }, quien)).status).toBe(403);
    expect((await porAsignar('', quien)).status).toBe(403);
    expect((await tecnicos(ids.obras, quien)).status).toBe(403);
  });

  it('sin token responde 401, y un ticket inexistente 404', async () => {
    expect((await request(app).patch('/api/v1/tickets/1/asignacion').send({ tecnicoId: 1 })).status).toBe(401);
    expect((await asignar(999999, { tecnicoId: ids.tecnicoA1 })).status).toBe(404);
  });

  it('dos asignaciones simultáneas se serializan: quedan las dos filas en orden y asignado_a es la última', async () => {
    const id = await ticket();

    const respuestas = await Promise.all([
      asignar(id, { tecnicoId: ids.tecnicoA1, motivo: 'Primera' }),
      asignar(id, { tecnicoId: ids.tecnicoA2, motivo: 'Segunda' }),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    const registradas = await filas(id);
    expect(registradas).toHaveLength(2);
    expect(registradas[0].tecnico_anterior).toBeNull();
    expect(registradas[1].tecnico_anterior).toBe(registradas[0].tecnico_nuevo);
    expect((await db('tickets').where({ id }).first('asignado_a')).asignado_a).toBe(registradas[1].tecnico_nuevo);
  });

  it('después de asignar un técnico, iniciar (SPEC 04) ya no lanza TECNICO_REQUERIDO', async () => {
    const id = await ticket();
    await asignar(id, { tecnicoId: ids.tecnicoA1 });

    const fila = await db('tickets').where({ id }).first();
    const guardado = Ticket.reconstituir({
      id,
      numero: fila.numero,
      estado: fila.estado,
      dependenciaId: Number(fila.dependencia_id),
      asignadoA: fila.asignado_a === null ? null : Number(fila.asignado_a),
      prioridad: fila.prioridad,
      escalado: fila.escalado,
      escaladoEn: null,
      escaladoPor: null,
      resueltoEn: fila.resuelto_en,
      cerradoEn: fila.cerrado_en,
      resolucion: null,
      resueltoPor: null,
      confirmacionVenceEn: null,
      reaperturas: 0,
    });

    expect(guardado.iniciar({ actorId: ids.tecnicoA1, ahora: new Date() }).ticket.estado).toBe('en_proceso');
  });
});
