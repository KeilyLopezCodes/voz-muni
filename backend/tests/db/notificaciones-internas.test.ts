import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';
import { prepararSla } from './sla-fixtures';

const PASSWORD = 'Clave-de-prueba-1';
const DIA = 24 * 60 * 60 * 1000;
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

interface Notificacion {
  tipo: string;
  datos: Record<string, unknown>;
  leida: boolean;
}

// Las notificaciones a los internos (SPEC 36) contra PostgreSQL: destinatarios, alcance, agrupación y transacciones.
describe('Notificaciones internas (SPEC 36)', () => {
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

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre, activa: true }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    await prepararSla(db, [ids.baches]);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['tecnico', 'tecnico', ids.obras],
      ['otroTecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['coordinadorAgua', 'coordinador', ids.agua],
      ['supervisor', 'supervisor', null],
      ['vecino', 'vecino', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave.toLowerCase()}@notificaciones-internas.test`;
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
    }
    // Un rol de prueba que ve todas las quejas y comenta en público, pero no lee notas internas. Solo participa con
    // comentarios insertados directamente: no inicia sesión.
    const [lector] = await db('roles')
      .insert({ nombre: 'lector_publico', permisos: JSON.stringify({ 'tickets.ver': 'todas', 'comentarios.publico': 'si' }) })
      .returning('id');
    const [usuarioLector] = await db('usuarios').insert({ nombre: 'Lector', telefono: '55551111', rol_id: lector.id }).returning('id');
    ids.lector = Number(usuarioLector.id);
    ids.rolLector = Number(lector.id);
  });

  afterAll(async () => {
    try {
      await db('comentarios').delete();
      await db('notificaciones').delete();
      await db('usuarios').where({ id: ids.lector }).delete();
      await db('roles').where({ id: ids.rolLector }).delete();
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  async function ticket(
    estado: EstadoTicket,
    { asignadoA = ids.tecnico as number | null, cambios = {} as Record<string, unknown> } = {},
  ): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Un bache grande que ya dañó dos carros',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'media',
        asignado_a: asignadoA,
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const asignar = (id: number, cuerpo: object, quien = 'coordinador') =>
    request(app).patch(`/api/v1/tickets/${id}/asignacion`).set(auth(quien)).send(cuerpo);
  const transicion = (id: number, cuerpo: object, quien: string) =>
    request(app).post(`/api/v1/tickets/${id}/transiciones`).set(auth(quien)).send(cuerpo);
  const comentar = (id: number, cuerpo: string, quien: string, interno = false) =>
    request(app).post(`/api/v1/tickets/${id}/comentarios`).set(auth(quien)).send({ cuerpo, interno });
  const solicitarTraslado = (id: number, quien: string) =>
    request(app).post(`/api/v1/tickets/${id}/traslados`).set(auth(quien)).send({ motivo: 'Es una fuga de agua' });
  const decidir = (solicitudId: number, accion: string, cuerpo: object = {}) =>
    request(app).post(`/api/v1/traslados/${solicitudId}/${accion}`).set(auth('supervisor')).send(cuerpo);

  const de = async (quien: string, ticketId: number): Promise<Notificacion[]> =>
    db('notificaciones').where({ usuario_id: ids[quien], ticket_id: ticketId }).orderBy('id').select('tipo', 'datos', 'leida');
  const tiposDe = async (quien: string, ticketId: number) => (await de(quien, ticketId)).map((n) => n.tipo);
  const todasDe = async (ticketId: number) =>
    db('notificaciones').where({ ticket_id: ticketId }).orderBy('id').select('usuario_id', 'tipo');

  describe('asignación (SPEC 20)', () => {
    it('el técnico recibe asignacion_recibida; el coordinador que asigna no recibe nada', async () => {
      const id = await ticket('asignada', { asignadoA: null });

      expect((await asignar(id, { tecnicoId: ids.tecnico })).status).toBe(200);

      expect(await todasDe(id)).toEqual([{ usuario_id: String(ids.tecnico), tipo: 'asignacion_recibida' }]);
      expect(await de('tecnico', id)).toEqual([{ tipo: 'asignacion_recibida', datos: {}, leida: false }]);
    });

    it('una reasignación notifica al técnico nuevo y al anterior', async () => {
      const id = await ticket('asignada');

      expect((await asignar(id, { tecnicoId: ids.otroTecnico, motivo: 'Cambio de turno' })).status).toBe(200);

      expect(await tiposDe('tecnico', id)).toEqual(['asignacion_retirada']);
      expect(await tiposDe('otroTecnico', id)).toEqual(['asignacion_recibida']);
      expect(await tiposDe('coordinador', id)).toEqual([]);
    });
  });

  describe('reapertura (SPEC 27)', () => {
    const resuelta = () =>
      ticket('resuelta', {
        cambios: {
          resuelto_en: new Date(),
          resolucion: 'Se rellenó el bache',
          resuelto_por: ids.tecnico,
          confirmacion_vence_en: new Date(Date.now() + 3 * DIA),
        },
      });

    it('si reabre el vecino, el técnico y el coordinador reciben queja_reabierta', async () => {
      const id = await resuelta();

      expect((await transicion(id, { accion: 'reabrir', motivo: 'Sigue el hoyo' }, 'vecino')).status).toBe(200);

      expect(await tiposDe('tecnico', id)).toEqual(['queja_reabierta']);
      expect(await tiposDe('coordinador', id)).toEqual(['queja_reabierta']);
      expect(await tiposDe('coordinadorAgua', id)).toEqual([]);
    });

    it('si reabre el coordinador, solo el técnico', async () => {
      const id = await resuelta();

      expect((await transicion(id, { accion: 'reabrir', motivo: 'El vecino llamó' }, 'coordinador')).status).toBe(200);

      expect(await todasDe(id)).toEqual([{ usuario_id: String(ids.tecnico), tipo: 'queja_reabierta' }]);
    });
  });

  describe('comentarios (SPEC 23)', () => {
    it('agrupa comentario_nuevo por queja: 1, luego 2 sin fila nueva; leída, la siguiente empieza en 1', async () => {
      const id = await ticket('en_proceso');
      await comentar(id, 'Revisen la profundidad', 'coordinador');

      await comentar(id, 'Vamos mañana', 'tecnico');
      expect(await de('coordinador', id)).toEqual([
        { tipo: 'comentario_nuevo', datos: { cantidad: 1, incluyeInternas: false }, leida: false },
      ]);
      await comentar(id, 'Ya llegamos', 'tecnico');
      const [agrupada] = await db('notificaciones').where({ usuario_id: ids.coordinador, ticket_id: id }).select('id', 'datos');
      expect(agrupada.datos).toEqual({ cantidad: 2, incluyeInternas: false });

      expect(
        (await request(app).patch(`/api/v1/notificaciones/${agrupada.id}`).set(auth('coordinador')).send({ leida: true })).status,
      ).toBe(200);
      await comentar(id, 'Terminamos', 'tecnico');

      expect(await de('coordinador', id)).toEqual([
        { tipo: 'comentario_nuevo', datos: { cantidad: 2, incluyeInternas: false }, leida: true },
        { tipo: 'comentario_nuevo', datos: { cantidad: 1, incluyeInternas: false }, leida: false },
      ]);
      // El técnico asignado también recibió el del coordinador.
      expect(await de('tecnico', id)).toEqual([
        { tipo: 'comentario_nuevo', datos: { cantidad: 1, incluyeInternas: false }, leida: false },
      ]);
    });

    it('una nota interna no llega a quien no tiene comentarios.interno y marca incluyeInternas', async () => {
      const id = await ticket('en_proceso');
      await db('comentarios').insert({ ticket_id: id, autor_id: ids.lector, cuerpo: 'Pasé por ahí', es_interno: false });
      await comentar(id, 'Revisen la profundidad', 'coordinador');
      await db('notificaciones').where({ ticket_id: id }).delete();

      await comentar(id, 'Vamos mañana', 'tecnico');
      await comentar(id, 'Llevar la mezcladora', 'tecnico', true);

      expect(await de('lector', id)).toEqual([
        { tipo: 'comentario_nuevo', datos: { cantidad: 1, incluyeInternas: false }, leida: false },
      ]);
      expect(await de('coordinador', id)).toEqual([
        { tipo: 'comentario_nuevo', datos: { cantidad: 2, incluyeInternas: true }, leida: false },
      ]);
    });

    it('un participante que ya no tiene la queja en su alcance no recibe nada', async () => {
      const id = await ticket('en_proceso');
      await comentar(id, 'Voy en camino', 'tecnico');
      await db('tickets').where({ id }).update({ asignado_a: ids.otroTecnico });

      await comentar(id, '¿Cómo van?', 'coordinador');

      expect(await tiposDe('tecnico', id)).toEqual([]);
      expect(await tiposDe('otroTecnico', id)).toEqual(['comentario_nuevo']);
    });

    it('la respuesta del vecino en espera llega al técnico como respuesta_vecino, no como comentario_nuevo', async () => {
      const id = await ticket('en_espera');
      await comentar(id, 'Necesitamos una foto', 'coordinador');
      await db('notificaciones').where({ ticket_id: id }).delete();

      expect((await comentar(id, 'Aquí va la foto', 'vecino')).status).toBe(201);

      expect(await de('tecnico', id)).toEqual([{ tipo: 'respuesta_vecino', datos: {}, leida: false }]);
      // El coordinador participó, pero la respuesta que reanuda solo va al técnico.
      expect(await tiposDe('coordinador', id)).toEqual([]);
    });

    it('sin técnico asignado, la respuesta del vecino la reciben los coordinadores', async () => {
      const id = await ticket('en_espera', { asignadoA: null });

      await comentar(id, 'Aquí va la foto', 'vecino');

      expect(await tiposDe('coordinador', id)).toEqual(['respuesta_vecino']);
      expect(await tiposDe('coordinadorAgua', id)).toEqual([]);
    });

    it('un comentario del vecino fuera de la espera llega como comentario_nuevo', async () => {
      const id = await ticket('en_proceso');

      await comentar(id, '¿Cuándo vienen?', 'vecino');

      expect(await tiposDe('tecnico', id)).toEqual(['comentario_nuevo']);
    });
  });

  describe('traslados (SPEC 21)', () => {
    it('el técnico solicita: el supervisor recibe traslado_solicitado; al aprobar, el técnico recibe un solo aprobada', async () => {
      const id = await ticket('en_proceso');

      const solicitud = await solicitarTraslado(id, 'tecnico');
      expect(solicitud.status).toBe(201);
      const solicitudId = solicitud.body.solicitud.id;
      expect(await de('supervisor', id)).toEqual([{ tipo: 'traslado_solicitado', datos: { solicitudId }, leida: false }]);

      expect((await decidir(solicitudId, 'aprobacion')).status).toBe(200);

      expect(await de('tecnico', id)).toEqual([
        { tipo: 'traslado_resuelto', datos: { solicitudId, resultado: 'aprobada' }, leida: false },
      ]);
    });

    it('si lo solicitó el coordinador, al aprobar lo reciben él y el técnico que tenía la queja', async () => {
      const id = await ticket('asignada');
      const solicitudId = (await solicitarTraslado(id, 'coordinador')).body.solicitud.id;

      await decidir(solicitudId, 'aprobacion');

      expect(await tiposDe('coordinador', id)).toEqual(['traslado_resuelto']);
      expect(await tiposDe('tecnico', id)).toEqual(['traslado_resuelto']);
    });

    it('rechazar notifica solo al solicitante, sin el motivo', async () => {
      const id = await ticket('en_proceso');
      const solicitudId = (await solicitarTraslado(id, 'coordinador')).body.solicitud.id;

      expect((await decidir(solicitudId, 'rechazo', { motivo: 'Es un bache' })).status).toBe(200);

      expect(await de('coordinador', id)).toEqual([
        { tipo: 'traslado_resuelto', datos: { solicitudId, resultado: 'rechazada' }, leida: false },
      ]);
      expect(await tiposDe('tecnico', id)).toEqual([]);
    });

    it('una solicitud que quedó sin efecto notifica al solicitante', async () => {
      const id = await ticket('en_proceso');
      const solicitudId = (await solicitarTraslado(id, 'tecnico')).body.solicitud.id;
      await db('tickets').where({ id }).update({ estado: 'en_espera' });

      expect((await decidir(solicitudId, 'aprobacion')).body.codigo).toBe('TRASLADO_SIN_EFECTO');

      expect(await de('tecnico', id)).toEqual([
        { tipo: 'traslado_resuelto', datos: { solicitudId, resultado: 'sin_efecto' }, leida: false },
      ]);
    });

    it('el traslado directo del supervisor notifica al técnico que tenía la queja', async () => {
      const id = await ticket('asignada');

      const res = await solicitarTraslado(id, 'supervisor');

      expect(res.status).toBe(200);
      expect(await todasDe(id)).toEqual([{ usuario_id: String(ids.tecnico), tipo: 'traslado_resuelto' }]);
      expect((await de('tecnico', id))[0].datos).toEqual({ solicitudId: res.body.solicitud.id, resultado: 'aprobada' });
    });

    it('un caso de uso revertido (409) no deja notificaciones', async () => {
      const id = await ticket('en_proceso');
      await solicitarTraslado(id, 'tecnico');

      const segunda = await solicitarTraslado(id, 'coordinador');

      expect(segunda.status).toBe(409);
      expect(await todasDe(id)).toEqual([{ usuario_id: String(ids.supervisor), tipo: 'traslado_solicitado' }]);
    });
  });
});
