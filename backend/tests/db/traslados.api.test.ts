import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

describe('Traslados entre dependencias (SPEC 21)', () => {
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

    for (const [clave, nombre, activa] of [
      ['obras', 'Dirección de Obras', true],
      ['agua', 'Agua Potable', true],
      ['cerrada', 'Dependencia cerrada', false],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre, activa }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['tecnico', 'tecnico', ids.obras],
      ['otroTecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['coordinadorAgua', 'coordinador', ids.agua],
      ['supervisor', 'supervisor', null],
      ['receptor', 'receptor', null],
      ['vecino', 'vecino', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@traslados.test`,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@traslados.test`, password: PASSWORD });
      tokens[clave] = res.body.accessToken;
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

  // Un ticket ya aceptado en Obras (SPEC 19) y asignado al técnico (SPEC 20).
  async function ticket(estado: EstadoTicket = 'asignada', asignadoA: number | null = ids.tecnico): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        dependencia_id: estado === 'nueva' || estado === 'en_revision' ? null : ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Fuga reportada como bache',
        descripcion: 'En realidad es una fuga de agua potable',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: estado === 'nueva' || estado === 'en_revision' ? null : 'media',
        asignado_a: asignadoA,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const solicitar = (id: number, cuerpo: object, quien = 'tecnico') =>
    request(app).post(`/api/v1/tickets/${id}/traslados`).set(auth(quien)).send(cuerpo);
  const decidir = (id: number, accion: 'aprobacion' | 'rechazo' | 'retiro', quien = 'supervisor', cuerpo: object = {}) =>
    request(app).post(`/api/v1/traslados/${id}/${accion}`).set(auth(quien)).send(cuerpo);
  const bandeja = (query = '', quien = 'supervisor') => request(app).get(`/api/v1/traslados${query}`).set(auth(quien));
  const estadoTicket = (id: number) => db('tickets').where({ id }).first('estado', 'dependencia_id', 'asignado_a');

  it('el técnico asignado solicita → 201 pendiente y la queja no cambia; una segunda → 409 TRASLADO_PENDIENTE', async () => {
    const id = await ticket('en_proceso');

    const res = await solicitar(id, { motivo: '  Es una fuga de agua ', dependenciaSugeridaId: ids.agua });

    expect(res.status).toBe(201);
    expect(res.body.ticket).toBeUndefined();
    expect(res.body.solicitud).toEqual({
      id: expect.any(Number),
      estado: 'pendiente',
      motivo: 'Es una fuga de agua',
      ticket: { id, numero: expect.stringMatching(/^Q-2026-/), titulo: 'Fuga reportada como bache', estado: 'en_proceso' },
      dependenciaOrigen: { id: ids.obras, nombre: 'Dirección de Obras' },
      dependenciaSugerida: { id: ids.agua, nombre: 'Agua Potable' },
      solicitadoPor: { id: ids.tecnico, nombre: 'Usuario tecnico', rol: 'tecnico' },
      resueltoPor: null,
      motivoResolucion: null,
      creadoEn: expect.stringMatching(/Z$/),
      resueltoEn: null,
    });
    expect(await estadoTicket(id)).toEqual({
      estado: 'en_proceso',
      dependencia_id: String(ids.obras),
      asignado_a: String(ids.tecnico),
    });

    const segunda = await solicitar(id, { motivo: 'Otra vez' }, 'coordinador');
    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('TRASLADO_PENDIENTE');
  });

  it('un técnico que no tiene la queja asignada → 404; un coordinador de otra dependencia → 404', async () => {
    const id = await ticket();

    expect((await solicitar(id, { motivo: 'x' }, 'otroTecnico')).status).toBe(404);
    expect((await solicitar(id, { motivo: 'x' }, 'coordinadorAgua')).status).toBe(404);
  });

  it('el coordinador de la dependencia solicita con sugerencia → 201', async () => {
    const id = await ticket('asignada', null);

    const res = await solicitar(id, { motivo: 'Corresponde a Agua', dependenciaSugeridaId: ids.agua }, 'coordinador');

    expect(res.status).toBe(201);
    expect(res.body.solicitud.solicitadoPor).toEqual({ id: ids.coordinador, nombre: 'Usuario coordinador', rol: 'coordinador' });
  });

  it.each([
    ['un motivo en blanco', { motivo: '   ' }, 400, 'MOTIVO_REQUERIDO'],
    ['una sugerida inactiva', { motivo: 'x', dependenciaSugeridaId: 'cerrada' }, 400, 'DEPENDENCIA_INVALIDA'],
    ['la sugerida igual a la de origen', { motivo: 'x', dependenciaSugeridaId: 'obras' }, 400, 'DEPENDENCIA_INVALIDA'],
    ['un campo de más', { motivo: 'x', estado: 'aprobada' }, 400, 'VALIDACION'],
    ['sin motivo', {}, 400, 'VALIDACION'],
  ])('%s → %i %s', async (_caso, cuerpo, status, codigo) => {
    const id = await ticket();
    const conIds = { ...cuerpo } as Record<string, unknown>;
    if (typeof conIds.dependenciaSugeridaId === 'string') {
      conIds.dependenciaSugeridaId = ids[conIds.dependenciaSugeridaId];
    }

    const res = await solicitar(id, conIds);

    expect(res.status).toBe(status);
    expect(res.body.codigo).toBe(codigo);
  });

  it('el supervisor ve la bandeja y aprueba: la queja vuelve a revisión y aparece en el triage con trasladoReciente', async () => {
    const id = await ticket('en_proceso');
    const { body } = await solicitar(id, { motivo: 'Es una fuga de agua', dependenciaSugeridaId: ids.agua });

    const pendientes = await bandeja();
    expect(pendientes.status).toBe(200);
    expect(pendientes.body.datos.map((s: { id: number }) => s.id)).toContain(body.solicitud.id);

    const res = await decidir(body.solicitud.id, 'aprobacion');

    expect(res.status).toBe(200);
    expect(res.body.ticket).toEqual({ id, numero: expect.any(String), estado: 'en_revision' });
    expect(res.body.solicitud).toMatchObject({
      estado: 'aprobada',
      resueltoPor: { id: ids.supervisor, nombre: 'Usuario supervisor' },
      resueltoEn: expect.stringMatching(/Z$/),
    });
    expect(await estadoTicket(id)).toEqual({ estado: 'en_revision', dependencia_id: null, asignado_a: null });
    expect(await db('ticket_historial').where({ ticket_id: id }).select('estado_anterior', 'estado_nuevo', 'usuario_id', 'motivo')).toEqual([
      { estado_anterior: 'en_proceso', estado_nuevo: 'en_revision', usuario_id: String(ids.supervisor), motivo: 'Es una fuga de agua' },
    ]);

    const triage = await request(app).get('/api/v1/tickets/triage').set(auth('supervisor'));
    expect(triage.body.datos.find((t: { id: number }) => t.id === id).trasladoReciente).toEqual({
      dependenciaOrigen: 'Dirección de Obras',
      dependenciaSugerida: 'Agua Potable',
      motivo: 'Es una fuga de agua',
    });
  });

  it('rechazar sin motivo → 400; con motivo → 200 y la queja sigue igual', async () => {
    const id = await ticket();
    const { body } = await solicitar(id, { motivo: 'x' });

    expect((await decidir(body.solicitud.id, 'rechazo', 'supervisor', {})).body.codigo).toBe('VALIDACION');
    expect((await decidir(body.solicitud.id, 'rechazo', 'supervisor', { motivo: '  ' })).body.codigo).toBe('MOTIVO_REQUERIDO');

    const res = await decidir(body.solicitud.id, 'rechazo', 'supervisor', { motivo: 'Sí es un bache' });

    expect(res.status).toBe(200);
    expect(res.body.solicitud).toMatchObject({ estado: 'rechazada', motivoResolucion: 'Sí es un bache' });
    expect((await estadoTicket(id)).estado).toBe('asignada');
  });

  it('el solicitante retira → 200; otro usuario → 404; y luego resolverla → 409 TRASLADO_YA_RESUELTO', async () => {
    const id = await ticket();
    const { body } = await solicitar(id, { motivo: 'x' });

    expect((await decidir(body.solicitud.id, 'retiro', 'coordinador')).status).toBe(404);
    const retiro = await decidir(body.solicitud.id, 'retiro', 'tecnico');
    expect(retiro.status).toBe(200);
    expect(retiro.body.solicitud).toMatchObject({ estado: 'retirada', resueltoPor: { id: ids.tecnico } });

    for (const accion of ['aprobacion', 'rechazo'] as const) {
      const res = await decidir(body.solicitud.id, accion, 'supervisor', { motivo: 'x' });
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('TRASLADO_YA_RESUELTO');
    }
    expect((await decidir(body.solicitud.id, 'retiro', 'tecnico')).body.codigo).toBe('TRASLADO_YA_RESUELTO');
  });

  it('el técnico y el coordinador reciben 403 en la bandeja, la aprobación y el rechazo', async () => {
    const id = await ticket();
    const { body } = await solicitar(id, { motivo: 'x' });

    for (const quien of ['tecnico', 'coordinador']) {
      expect((await bandeja('', quien)).status).toBe(403);
      expect((await decidir(body.solicitud.id, 'aprobacion', quien)).status).toBe(403);
      expect((await decidir(body.solicitud.id, 'rechazo', quien, { motivo: 'x' })).status).toBe(403);
    }
  });

  it.each(['receptor', 'vecino', 'administrador'])('el %s recibe 403 al solicitar y en GET /dependencias', async (quien) => {
    const id = await ticket();

    expect((await solicitar(id, { motivo: 'x' }, quien)).status).toBe(403);
    expect((await request(app).get('/api/v1/dependencias').set(auth(quien))).status).toBe(403);
  });

  it('el supervisor traslada directo una en_proceso → 200 con la solicitud aprobada a su nombre', async () => {
    const id = await ticket('en_proceso');

    const res = await solicitar(id, { motivo: 'Lo traslado yo' }, 'supervisor');

    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ id, estado: 'en_revision' });
    expect(res.body.solicitud).toMatchObject({
      estado: 'aprobada',
      solicitadoPor: { id: ids.supervisor, rol: 'supervisor' },
      resueltoPor: { id: ids.supervisor },
    });
    expect(await estadoTicket(id)).toEqual({ estado: 'en_revision', dependencia_id: null, asignado_a: null });
  });

  it.each<EstadoTicket>(['nueva', 'en_espera', 'resuelta'])('trasladar una %s → 409 TRANSICION_INVALIDA', async (estado) => {
    const id = await ticket(estado, estado === 'nueva' ? null : ids.tecnico);

    const res = await solicitar(id, { motivo: 'x' }, 'supervisor');

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('aprobar después de que la queja pasó a resuelta → 409 TRASLADO_SIN_EFECTO y la solicitud queda sin_efecto', async () => {
    const id = await ticket('en_proceso');
    const { body } = await solicitar(id, { motivo: 'x' });
    await db('tickets').where({ id }).update({ estado: 'resuelta', resuelto_en: new Date() });

    const res = await decidir(body.solicitud.id, 'aprobacion');

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('TRASLADO_SIN_EFECTO');
    expect(await db('solicitudes_traslado').where({ id: body.solicitud.id }).first('estado', 'resuelto_por')).toEqual({
      estado: 'sin_efecto',
      resuelto_por: String(ids.supervisor),
    });
    expect((await estadoTicket(id)).estado).toBe('resuelta');
    expect((await bandeja('?estado=sin_efecto')).body.datos.map((s: { id: number }) => s.id)).toContain(body.solicitud.id);
  });

  it('la bandeja filtra por estado, ordena de la más antigua y pagina; un id inexistente → 404', async () => {
    const res = await bandeja('?estado=aprobada&tamano=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, tamano: 1 });
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.datos.every((s: { estado: string }) => s.estado === 'aprobada')).toBe(true);

    const todas = (await bandeja('?estado=aprobada')).body.datos as { creadoEn: string }[];
    expect([...todas].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))).toEqual(todas);

    expect((await bandeja('?estado=otra')).status).toBe(400);
    expect((await decidir(999999, 'aprobacion')).status).toBe(404);
  });

  it('GET /dependencias devuelve las activas por nombre', async () => {
    const res = await request(app).get('/api/v1/dependencias').set(auth('coordinador'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: ids.agua, nombre: 'Agua Potable' },
      { id: ids.obras, nombre: 'Dirección de Obras' },
    ]);
  });
});
