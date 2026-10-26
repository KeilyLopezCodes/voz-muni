import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

describe('Comentarios públicos y notas internas (SPEC 23)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
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
      ['otroTecnico', 'tecnico', ids.obras],
      ['receptor', 'receptor', null],
      ['coordinador', 'coordinador', ids.obras],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@comentarios.test`,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@comentarios.test`, password: PASSWORD });
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

  // Una queja del vecino, registrada por el receptor, en Obras y asignada al técnico.
  async function ticket(estado: EstadoTicket = 'en_proceso', solicitante = ids.vecino): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitante,
        registrado_por: ids.receptor,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'telefono',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'media',
        asignado_a: ids.tecnico,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const comentar = (id: number, cuerpo: object, quien: string) =>
    request(app).post(`/api/v1/tickets/${id}/comentarios`).set(auth(quien)).send(cuerpo);
  const hilo = (id: number, quien: string) => request(app).get(`/api/v1/tickets/${id}/comentarios`).set(auth(quien));
  const editar = (id: number, comentarioId: number, cuerpo: object, quien: string) =>
    request(app).patch(`/api/v1/tickets/${id}/comentarios/${comentarioId}`).set(auth(quien)).send(cuerpo);

  it('el técnico asignado escribe una nota interna y un público → 201; el vecino solo ve el público', async () => {
    const id = await ticket();

    const nota = await comentar(id, { cuerpo: 'Llevar la mezcladora', interno: true }, 'tecnico');
    const publico = await comentar(id, { cuerpo: '  Iremos el jueves  ' }, 'tecnico');

    expect(nota.status).toBe(201);
    expect(publico.status).toBe(201);
    expect(publico.body).toEqual({
      comentario: {
        id: expect.any(Number),
        cuerpo: 'Iremos el jueves',
        interno: false,
        autor: { id: ids.tecnico, nombre: 'Usuario tecnico', rol: 'tecnico' },
        esDelSolicitante: false,
        creadoEn: expect.stringMatching(/Z$/),
        editadoEn: null,
        editable: true,
      },
      ticket: { id, estado: 'en_proceso' },
    });

    const delVecino = await hilo(id, 'vecino');
    expect(delVecino.status).toBe(200);
    expect(delVecino.body.datos.map((c: { cuerpo: string }) => c.cuerpo)).toEqual(['Iremos el jueves']);
    expect(JSON.stringify(delVecino.body)).not.toContain('mezcladora');
    expect(delVecino.body.datos[0].editable).toBe(false);

    const delTecnico = await hilo(id, 'tecnico');
    expect(delTecnico.body.datos.map((c: { cuerpo: string; interno: boolean }) => [c.cuerpo, c.interno])).toEqual([
      ['Llevar la mezcladora', true],
      ['Iremos el jueves', false],
    ]);
  });

  it('el vecino comenta su queja en espera → 201 con ticket en_proceso y una fila de historial a su nombre', async () => {
    const id = await ticket('en_espera');
    // Los comentarios públicos de las pruebas anteriores avisan al vecino (SPEC 35).
    enviador.enviados.length = 0;

    const res = await comentar(id, { cuerpo: 'Es la casa 12, portón verde' }, 'vecino');

    expect(res.status).toBe(201);
    expect(res.body.ticket).toEqual({ id, estado: 'en_proceso' });
    expect(res.body.comentario.esDelSolicitante).toBe(true);
    expect(await db('tickets').where({ id }).first('estado')).toEqual({ estado: 'en_proceso' });
    expect(await db('ticket_historial').where({ ticket_id: id }).select('estado_anterior', 'estado_nuevo', 'usuario_id', 'motivo')).toEqual([
      { estado_anterior: 'en_espera', estado_nuevo: 'en_proceso', usuario_id: String(ids.vecino), motivo: null },
    ]);
    expect(enviador.enviados).toEqual([]);
  });

  it('un comentario público del receptor en una queja en espera no la reanuda', async () => {
    const id = await ticket('en_espera');

    const res = await comentar(id, { cuerpo: 'El vecino llamó por teléfono' }, 'receptor');

    expect(res.status).toBe(201);
    expect(res.body.ticket.estado).toBe('en_espera');
    expect(await db('ticket_historial').where({ ticket_id: id })).toEqual([]);
  });

  it('el vecino intenta una nota interna → 403, comenta una queja ajena → 404, y el administrador → 403', async () => {
    const id = await ticket();
    const ajena = await ticket('en_proceso', ids.otroVecino);

    expect((await comentar(id, { cuerpo: 'x', interno: true }, 'vecino')).status).toBe(403);
    expect((await comentar(ajena, { cuerpo: 'x' }, 'vecino')).status).toBe(404);
    expect((await hilo(ajena, 'vecino')).status).toBe(404);
    const admin = await comentar(id, { cuerpo: 'x' }, 'administrador');
    expect(admin.status).toBe(403);
    expect(admin.body.codigo).toBe('PERMISO_DENEGADO');
  });

  it('un técnico que no tiene la queja asignada → 404; el coordinador y el supervisor comentan → 201', async () => {
    const id = await ticket();

    expect((await comentar(id, { cuerpo: 'x' }, 'otroTecnico')).status).toBe(404);
    expect((await comentar(id, { cuerpo: 'Del coordinador', interno: true }, 'coordinador')).status).toBe(201);
    expect((await comentar(id, { cuerpo: 'Del supervisor' }, 'supervisor')).status).toBe(201);
  });

  it.each<EstadoTicket>(['rechazada', 'cerrada'])('en una queja %s, un público → 409 QUEJA_FINALIZADA y una nota interna → 201', async (estado) => {
    const id = await ticket(estado);

    const publico = await comentar(id, { cuerpo: 'Hola' }, 'supervisor');
    expect(publico.status).toBe(409);
    expect(publico.body.codigo).toBe('QUEJA_FINALIZADA');
    expect((await comentar(id, { cuerpo: 'Para el archivo', interno: true }, 'supervisor')).status).toBe(201);
  });

  it.each([
    ['vacío', { cuerpo: '   ' }, 'CUERPO_INVALIDO'],
    ['de 4001 caracteres', { cuerpo: 'a'.repeat(4001) }, 'CUERPO_INVALIDO'],
    ['sin cuerpo', {}, 'VALIDACION'],
    ['con un campo de más', { cuerpo: 'x', autorId: 1 }, 'VALIDACION'],
  ])('un comentario %s → 400 %s', async (_caso, cuerpo, codigo) => {
    const id = await ticket();

    const res = await comentar(id, cuerpo, 'tecnico');

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
  });

  it('el autor edita dentro de los 5 minutos → 200 con editado_en; nadie más puede; interno no se cambia', async () => {
    const id = await ticket('en_espera');
    const { body } = await comentar(id, { cuerpo: 'Primera versión' }, 'receptor');
    const comentarioId = body.comentario.id;
    await db('comentarios').where({ id: comentarioId }).update({ creado_en: new Date(Date.now() - 2 * 60_000) });

    expect((await editar(id, comentarioId, { cuerpo: 'x' }, 'tecnico')).status).toBe(404);
    const interno = await editar(id, comentarioId, { cuerpo: 'x', interno: true }, 'receptor');
    expect(interno.status).toBe(400);
    expect(interno.body.codigo).toBe('VALIDACION');

    const res = await editar(id, comentarioId, { cuerpo: '  Versión corregida ' }, 'receptor');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cuerpo: 'Versión corregida', editadoEn: expect.stringMatching(/Z$/), editable: true });
    const fila = await db('comentarios').where({ id: comentarioId }).first('cuerpo', 'editado_en');
    expect(fila.cuerpo).toBe('Versión corregida');
    expect(fila.editado_en).toBeInstanceOf(Date);
    // Editar no reanuda la queja, aunque esté en espera.
    expect((await db('tickets').where({ id }).first('estado')).estado).toBe('en_espera');
  });

  it('editar pasados 5 minutos → 409 EDICION_VENCIDA', async () => {
    const id = await ticket();
    const { body } = await comentar(id, { cuerpo: 'Viejo' }, 'tecnico');
    await db('comentarios').where({ id: body.comentario.id }).update({ creado_en: new Date(Date.now() - 5 * 60_000 - 1000) });

    const res = await editar(id, body.comentario.id, { cuerpo: 'Nuevo' }, 'tecnico');

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('EDICION_VENCIDA');
    expect((await hilo(id, 'tecnico')).body.datos[0].editable).toBe(false);
  });

  it('editar un comentario con el id de otro ticket → 404', async () => {
    const id = await ticket();
    const otro = await ticket();
    const { body } = await comentar(id, { cuerpo: 'En el primero' }, 'tecnico');

    expect((await editar(otro, body.comentario.id, { cuerpo: 'x' }, 'tecnico')).status).toBe(404);
  });
});
