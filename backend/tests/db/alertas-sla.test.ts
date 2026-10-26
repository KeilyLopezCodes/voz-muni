import path from 'node:path';
import type { Knex } from 'knex';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(): Promise<void> {}
}

const AHORA = new Date('2026-11-02T20:00:00.000Z');
const ANTES = new Date('2026-11-02T19:00:00.000Z');
const DESPUES = new Date('2026-11-02T21:00:00.000Z');
const VENCE = new Date('2026-11-03T15:00:00.000Z');

describe('Alertas al umbral del SLA (SPEC 31)', () => {
  let db: Knex;
  let container: Container;
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
        prioridad: 'urgente',
        asignado_a: ids.tecnico,
        vence_respuesta: VENCE,
        vence_resolucion: VENCE,
        alerta_respuesta_en: ANTES,
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const notificaciones = (ticketId: number) =>
    db('notificaciones').where({ ticket_id: ticketId }).orderBy('usuario_id').select('usuario_id', 'tipo', 'datos', 'leida');

  const usuario = async (email: string) => Number((await db('usuarios').where({ email }).first('id')).id);

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    ids.vecino = await usuario('vecino@vozmuni.test');
    ids.tecnico = await usuario('tecnico@vozmuni.test');
    ids.coordinador = await usuario('coordinador@vozmuni.test');
    ids.obras = Number((await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id')).id);
    ids.otraDependencia = Number((await db('dependencias').whereNot({ id: ids.obras }).first('id')).id);
    ids.baches = Number((await db('categorias').where({ nombre: 'Baches' }).first('id')).id);
    ids.zona = Number((await db('zonas').first('id')).id);

    const { id: rolCoordinador } = await db('roles').where({ nombre: 'coordinador' }).first('id');
    const [inactivo] = await db('usuarios')
      .insert({ nombre: 'Coordinador inactivo', email: 'inactivo@alertas.test', rol_id: rolCoordinador, dependencia_id: ids.obras, activo: false })
      .returning('id');
    ids.inactivo = Number(inactivo.id);
    const [ajeno] = await db('usuarios')
      .insert({ nombre: 'Coordinador de otra', email: 'otra@alertas.test', rol_id: rolCoordinador, dependencia_id: ids.otraDependencia })
      .returning('id');
    ids.ajeno = Number(ajeno.id);
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
    await db('tickets').update({ alerta_respuesta_enviada_en: AHORA, alerta_resolucion_enviada_en: AHORA });
  });

  it('una queja asignada con el umbral de respuesta pasado avisa al técnico y al coordinador, y marca la alerta', async () => {
    const id = await ticket('asignada');
    expect(await container.alertasSlaService.procesar(AHORA)).toBe(1);
    expect(await notificaciones(id)).toEqual(
      [ids.tecnico, ids.coordinador]
        .sort((a, b) => a - b)
        .map((usuarioId) => ({
          usuario_id: String(usuarioId),
          tipo: 'sla_alerta_respuesta',
          datos: { vence: VENCE.toISOString(), umbral: 80 },
          leida: false,
        })),
    );
    expect(await db('tickets').where({ id }).first('alerta_respuesta_enviada_en')).toEqual({ alerta_respuesta_enviada_en: AHORA });
  });

  it('una segunda corrida no duplica', async () => {
    const id = await ticket('asignada');
    await container.alertasSlaService.procesar(AHORA);
    expect(await container.alertasSlaService.procesar(AHORA)).toBe(0);
    expect(await notificaciones(id)).toHaveLength(2);
  });

  it('no avisa a un coordinador de otra dependencia ni a uno inactivo', async () => {
    const id = await ticket('asignada');
    await container.alertasSlaService.procesar(AHORA);
    const usuarios = (await notificaciones(id)).map((n) => Number(n.usuario_id));
    expect(usuarios).not.toContain(ids.ajeno);
    expect(usuarios).not.toContain(ids.inactivo);
  });

  it('sin técnico asignado avisa solo a los coordinadores', async () => {
    const id = await ticket('asignada', { asignado_a: null });
    await container.alertasSlaService.procesar(AHORA);
    expect((await notificaciones(id)).map((n) => Number(n.usuario_id))).toEqual([ids.coordinador]);
  });

  it('sin destinatarios marca la alerta y no inserta filas', async () => {
    const id = await ticket('asignada', { asignado_a: null, dependencia_id: ids.otraDependencia });
    await db('usuarios').where({ id: ids.ajeno }).update({ activo: false });
    try {
      expect(await container.alertasSlaService.procesar(AHORA)).toBe(1);
      expect(await notificaciones(id)).toEqual([]);
      expect(await db('tickets').where({ id }).first('alerta_respuesta_enviada_en')).toEqual({ alerta_respuesta_enviada_en: AHORA });
    } finally {
      await db('usuarios').where({ id: ids.ajeno }).update({ activo: true });
    }
  });

  it('la alerta de resolución sale como sla_alerta_resolucion con vence_resolucion', async () => {
    const id = await ticket('en_proceso', {
      primera_respuesta_en: ANTES,
      alerta_respuesta_en: null,
      alerta_resolucion_en: ANTES,
    });
    expect(await container.alertasSlaService.procesar(AHORA)).toBe(1);
    expect((await notificaciones(id)).map((n) => n.tipo)).toEqual(['sla_alerta_resolucion', 'sla_alerta_resolucion']);
  });

  it.each<[string, EstadoTicket, Record<string, unknown>]>([
    ['en_espera', 'en_espera', {}],
    ['en_revision', 'en_revision', {}],
    ['resuelta', 'resuelta', {}],
    ['con primera respuesta', 'en_proceso', { primera_respuesta_en: ANTES }],
    ['con el umbral en el futuro', 'asignada', { alerta_respuesta_en: DESPUES }],
  ])('una queja %s no se reclama para respuesta', async (_caso, estado, cambios) => {
    const id = await ticket(estado, cambios);
    expect(await container.alertasSlaService.procesar(AHORA)).toBe(0);
    expect(await notificaciones(id)).toEqual([]);
    expect(await db('tickets').where({ id }).first('alerta_respuesta_enviada_en')).toEqual({ alerta_respuesta_enviada_en: null });
  });

  it('dos procesar simultáneos envían cada alerta una sola vez', async () => {
    const creadas = await Promise.all(Array.from({ length: 30 }, () => ticket('asignada')));
    const [a, b] = await Promise.all([container.alertasSlaService.procesar(AHORA), container.alertasSlaService.procesar(AHORA)]);
    expect(a + b).toBe(30);
    const filas = await db('notificaciones').whereIn('ticket_id', creadas).count({ total: '*' });
    expect(Number(filas[0].total)).toBe(60);
  });

  it('más de 200 pendientes se procesan en varios lotes', async () => {
    const filas = Array.from({ length: 205 }, () => ({
      numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
      solicitante_id: ids.vecino,
      registrado_por: ids.vecino,
      categoria_id: ids.baches,
      dependencia_id: ids.obras,
      zona_id: ids.zona,
      canal: 'portal',
      titulo: 'Bache',
      descripcion: 'Hay un bache profundo',
      direccion: 'Calle 1',
      estado: 'asignada',
      prioridad: 'urgente',
      asignado_a: null,
      vence_respuesta: VENCE,
      alerta_respuesta_en: ANTES,
    }));
    await db.batchInsert('tickets', filas, 100);
    expect(await container.alertasSlaService.procesar(AHORA)).toBe(205);
    const [{ total }] = await db('tickets').whereNull('alerta_respuesta_enviada_en').count({ total: '*' });
    expect(Number(total)).toBe(0);
  });
});
