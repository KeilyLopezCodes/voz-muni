import path from 'node:path';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');
const PASSWORD_DESARROLLO = 'Desarrollo2026';

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(): Promise<void> {}
}

// Con la hora real: reabrir valida el plazo de confirmación con el reloj de la app.
const AHORA = new Date();
const HORA = 3_600_000;
const VENCIO = new Date(AHORA.getTime() - 2 * HORA);
const VENCIO_ANTES = new Date(AHORA.getTime() - 3 * HORA);
const VENCE = new Date(AHORA.getTime() + 24 * HORA);

describe('Escalamiento al vencer el SLA (SPEC 32)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  let correlativo = 1;

  async function ticket(estado: EstadoTicket, cambios: Record<string, unknown> = {}): Promise<number> {
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
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'alta',
        asignado_a: ids.tecnico,
        vence_respuesta: VENCE,
        vence_resolucion: VENCE,
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const marca = (id: number) => db('tickets').where({ id }).first('escalado', 'escalado_en', 'escalado_por', 'estado');
  const notificaciones = (ticketId: number) =>
    db('notificaciones').where({ ticket_id: ticketId }).orderBy('usuario_id').select('usuario_id', 'tipo', 'datos');
  const usuario = async (email: string) => Number((await db('usuarios').where({ email }).first('id')).id);

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    for (const rol of ['vecino', 'tecnico', 'coordinador', 'supervisor', 'administrador']) {
      ids[rol] = await usuario(`${rol}@vozmuni.test`);
    }
    ids.obras = Number((await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id')).id);
    ids.baches = Number((await db('categorias').where({ nombre: 'Baches' }).first('id')).id);
    ids.zona = Number((await db('zonas').first('id')).id);
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
    await db('notificaciones').del();
    // Lo que dejó escalable una prueba anterior no cuenta en la siguiente.
    await db('tickets').where({ escalado: false }).update({ estado: 'cerrada', cerrado_en: AHORA });
  });

  it('una queja asignada con la respuesta vencida escala por respuesta y notifica al supervisor', async () => {
    const id = await ticket('asignada', { vence_respuesta: VENCIO });
    expect(await container.escalamientoService.procesar(AHORA)).toBe(1);
    expect(await marca(id)).toEqual({ escalado: true, escalado_en: AHORA, escalado_por: 'respuesta', estado: 'asignada' });
    expect(await notificaciones(id)).toEqual([
      { usuario_id: String(ids.supervisor), tipo: 'sla_escalamiento', datos: { plazo: 'respuesta', vence: VENCIO.toISOString() } },
    ]);
    // No es un cambio de estado: no escribe historial.
    expect(await db('ticket_historial').where({ ticket_id: id })).toEqual([]);
  });

  it('una queja en_proceso con la resolución vencida escala por resolución', async () => {
    const id = await ticket('en_proceso', { primera_respuesta_en: VENCIO_ANTES, vence_resolucion: VENCIO });
    await container.escalamientoService.procesar(AHORA);
    expect(await marca(id)).toMatchObject({ escalado: true, escalado_por: 'resolucion' });
  });

  it('con los dos vencidos gana el que venció primero', async () => {
    const porResolucion = await ticket('asignada', { vence_respuesta: VENCIO, vence_resolucion: VENCIO_ANTES });
    const porRespuesta = await ticket('asignada', { vence_respuesta: VENCIO_ANTES, vence_resolucion: VENCIO });
    await container.escalamientoService.procesar(AHORA);
    expect(await marca(porResolucion)).toMatchObject({ escalado_por: 'resolucion' });
    expect(await marca(porRespuesta)).toMatchObject({ escalado_por: 'respuesta' });
    expect((await notificaciones(porResolucion))[0].datos).toEqual({ plazo: 'resolucion', vence: VENCIO_ANTES.toISOString() });
  });

  it('una queja en_revision trasladada, sin dependencia, con la resolución vencida escala', async () => {
    const id = await ticket('en_revision', {
      dependencia_id: null,
      asignado_a: null,
      primera_respuesta_en: VENCIO_ANTES,
      vence_resolucion: VENCIO,
    });
    await container.escalamientoService.procesar(AHORA);
    expect(await marca(id)).toMatchObject({ escalado: true, escalado_por: 'resolucion', estado: 'en_revision' });
  });

  it.each<[string, EstadoTicket, Record<string, unknown>]>([
    ['en_espera sin escalar (vence_resolucion NULL)', 'en_espera', { primera_respuesta_en: VENCIO_ANTES, vence_resolucion: null }],
    ['resuelta', 'resuelta', { vence_respuesta: VENCIO, vence_resolucion: VENCIO, resuelto_en: AHORA }],
    ['cerrada', 'cerrada', { vence_respuesta: VENCIO, vence_resolucion: VENCIO, cerrado_en: AHORA }],
    ['rechazada', 'rechazada', { vence_respuesta: VENCIO, vence_resolucion: VENCIO }],
    ['nueva', 'nueva', { vence_respuesta: null, vence_resolucion: null, asignado_a: null }],
    ['con primera respuesta, la respuesta vencida y la resolución vigente', 'en_proceso', { primera_respuesta_en: VENCIO_ANTES, vence_respuesta: VENCIO }],
  ])('no escala una queja %s', async (_caso, estado, cambios) => {
    const id = await ticket(estado, cambios);
    expect(await container.escalamientoService.procesar(AHORA)).toBe(0);
    expect(await marca(id)).toMatchObject({ escalado: false, escalado_en: null });
    expect(await notificaciones(id)).toEqual([]);
  });

  it('una segunda corrida no vuelve a escalar ni a notificar', async () => {
    const id = await ticket('asignada', { vence_respuesta: VENCIO });
    await container.escalamientoService.procesar(AHORA);
    expect(await container.escalamientoService.procesar(new Date(AHORA.getTime() + 60_000))).toBe(0);
    expect(await marca(id)).toMatchObject({ escalado_en: AHORA });
    expect(await notificaciones(id)).toHaveLength(1);
  });

  it('ni el administrador, ni el coordinador, ni el técnico reciben la notificación', async () => {
    const id = await ticket('asignada', { vence_respuesta: VENCIO });
    await container.escalamientoService.procesar(AHORA);
    const destinatarios = (await notificaciones(id)).map((n) => Number(n.usuario_id));
    expect(destinatarios).toEqual([ids.supervisor]);
  });

  it('sin supervisores activos escala igual', async () => {
    const id = await ticket('asignada', { vence_respuesta: VENCIO });
    await db('usuarios').where({ id: ids.supervisor }).update({ activo: false });
    try {
      expect(await container.escalamientoService.procesar(AHORA)).toBe(1);
      expect(await marca(id)).toMatchObject({ escalado: true });
      expect(await notificaciones(id)).toEqual([]);
    } finally {
      await db('usuarios').where({ id: ids.supervisor }).update({ activo: true });
    }
  });

  it('dos procesar simultáneos escalan cada queja una sola vez', async () => {
    const creadas = await Promise.all(Array.from({ length: 30 }, () => ticket('asignada', { vence_respuesta: VENCIO })));
    const [a, b] = await Promise.all([container.escalamientoService.procesar(AHORA), container.escalamientoService.procesar(AHORA)]);
    expect(a + b).toBe(30);
    const [{ total }] = await db('notificaciones').whereIn('ticket_id', creadas).count({ total: '*' });
    expect(Number(total)).toBe(30);
  });

  it('reabrir una queja escalada deja escalado, escalado_en y escalado_por limpios', async () => {
    const id = await ticket('resuelta', {
      vence_respuesta: VENCIO,
      primera_respuesta_en: VENCIO_ANTES,
      vence_resolucion: VENCIO,
      escalado: true,
      escalado_en: VENCIO,
      escalado_por: 'resolucion',
      resuelto_en: VENCIO,
      resuelto_por: ids.tecnico,
      resolucion: 'Se rellenó el bache',
      confirmacion_vence_en: VENCE,
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'vecino@vozmuni.test', password: PASSWORD_DESARROLLO });
    const res = await request(app)
      .post(`/api/v1/tickets/${id}/transiciones`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ accion: 'reabrir', motivo: 'El bache volvió a abrirse' });
    expect(res.status).toBe(200);
    expect(await marca(id)).toEqual({ escalado: false, escalado_en: null, escalado_por: null, estado: 'en_proceso' });
  });
});
