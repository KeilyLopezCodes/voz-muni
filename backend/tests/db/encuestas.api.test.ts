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
const DIA = 24 * 60 * 60 * 1000;
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

// POST /api/v1/tickets/:id/encuesta (SPEC 39) contra PostgreSQL.
describe('Encuesta de satisfacción (SPEC 39)', () => {
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
    ids.obras = Number(obras.id);
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['vecino', 'vecino', null],
      ['otroVecino', 'vecino', null],
      ['tecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave.toLowerCase()}@encuestas.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${clave}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date(), dependencia_id: dependenciaId })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
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

  beforeEach(async () => {
    await db('parametros').where({ clave: 'encuesta_umbral_alerta' }).update({ valor: JSON.stringify(2) });
  });

  async function queja(estado: EstadoTicket = 'cerrada', cerradoHaceDias: number | null = 1): Promise<number> {
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
        asignado_a: ids.tecnico,
        cerrado_en: cerradoHaceDias === null ? null : new Date(Date.now() - cerradoHaceDias * DIA),
      })
      .returning('id');
    return Number(fila.id);
  }

  const calificar = (id: number, cuerpo: object, quien = 'vecino') =>
    request(app).post(`/api/v1/tickets/${id}/encuesta`).set('Authorization', `Bearer ${tokens[quien]}`).send(cuerpo);
  const notificacionesDe = (quien: string, ticketId: number) =>
    db('notificaciones').where({ usuario_id: ids[quien], ticket_id: ticketId }).select('tipo', 'datos');

  it('el vecino califica su queja cerrada con 4 y un comentario → 201; una segunda vez → 409 ENCUESTA_EXISTENTE', async () => {
    const id = await queja();

    const res = await calificar(id, { calificacion: 4, comentario: '  Rápido y bien hecho  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ calificacion: 4, comentario: 'Rápido y bien hecho', creadoEn: expect.any(String) });
    expect(await db('encuestas').where({ ticket_id: id }).first('calificacion', 'comentario')).toEqual({
      calificacion: 4,
      comentario: 'Rápido y bien hecho',
    });
    const segunda = await calificar(id, { calificacion: 5 });
    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('ENCUESTA_EXISTENTE');
  });

  it('una queja cerrada automáticamente también se califica', async () => {
    const id = await queja();
    await db('ticket_historial').insert({ ticket_id: id, estado_anterior: 'resuelta', estado_nuevo: 'cerrada', usuario_id: null });
    expect((await calificar(id, { calificacion: 3 })).status).toBe(201);
  });

  it('una queja resuelta → 409 ENCUESTA_NO_DISPONIBLE; fuera de plazo → 409 ENCUESTA_VENCIDA', async () => {
    expect((await calificar(await queja('resuelta', null), { calificacion: 4 })).body.codigo).toBe('ENCUESTA_NO_DISPONIBLE');
    expect((await calificar(await queja('rechazada', null), { calificacion: 4 })).body.codigo).toBe('ENCUESTA_NO_DISPONIBLE');
    const vencida = await calificar(await queja('cerrada', 31), { calificacion: 4 });
    expect(vencida.status).toBe(409);
    expect(vencida.body.codigo).toBe('ENCUESTA_VENCIDA');
  });

  it('el coordinador → 403; otro vecino → 404; sin sesión → 401', async () => {
    const id = await queja();
    expect((await calificar(id, { calificacion: 4 }, 'coordinador')).status).toBe(403);
    expect((await calificar(id, { calificacion: 4 }, 'otroVecino')).status).toBe(404);
    expect((await request(app).post(`/api/v1/tickets/${id}/encuesta`).send({ calificacion: 4 })).status).toBe(401);
    expect(await db('encuestas').where({ ticket_id: id })).toEqual([]);
  });

  it('una calificación de 2 notifica encuesta_baja al coordinador; una de 3, no; con el umbral en 0, nunca', async () => {
    const baja = await queja();
    await calificar(baja, { calificacion: 2 });
    expect(await notificacionesDe('coordinador', baja)).toEqual([{ tipo: 'encuesta_baja', datos: { calificacion: 2 } }]);
    expect(await notificacionesDe('tecnico', baja)).toEqual([]);

    const media = await queja();
    await calificar(media, { calificacion: 3 });
    expect(await notificacionesDe('coordinador', media)).toEqual([]);

    await db('parametros').where({ clave: 'encuesta_umbral_alerta' }).update({ valor: JSON.stringify(0) });
    const conUmbralCero = await queja();
    await calificar(conUmbralCero, { calificacion: 1 });
    expect(await notificacionesDe('coordinador', conUmbralCero)).toEqual([]);
  });

  it.each([
    ['una calificación de 7', { calificacion: 7 }],
    ['una calificación no entera', { calificacion: 3.5 }],
    ['un comentario de 1001 caracteres', { calificacion: 4, comentario: 'a'.repeat(1001) }],
    ['un campo extra', { calificacion: 4, otro: 1 }],
    ['sin calificación', { comentario: 'Hola' }],
  ])('%s → 400 VALIDACION', async (_caso, cuerpo) => {
    const res = await calificar(await queja(), cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDACION');
  });

  it('dos envíos simultáneos dejan una sola encuesta', async () => {
    const id = await queja();

    const respuestas = await Promise.all([calificar(id, { calificacion: 4 }), calificar(id, { calificacion: 5 })]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db('encuestas').where({ ticket_id: id })).toHaveLength(1);
  });

  it('un parámetro inválido → 409 PARAMETRO_INVALIDO sin guardar nada', async () => {
    const id = await queja();
    await db('parametros').where({ clave: 'encuesta_umbral_alerta' }).update({ valor: JSON.stringify('dos') });
    expect((await calificar(id, { calificacion: 4 })).body.codigo).toBe('PARAMETRO_INVALIDO');
    expect(await db('encuestas').where({ ticket_id: id })).toEqual([]);
  });
});
