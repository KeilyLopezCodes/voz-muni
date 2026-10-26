import path from 'node:path';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');
const PASSWORD_DESARROLLO = 'Desarrollo2026';

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(): Promise<void> {}
}

describe('API de notificaciones (SPEC 31)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};

  const como = (rol: string) => ({
    get: (ruta: string) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[rol]}`),
    patch: (ruta: string, cuerpo: object) =>
      request(app).patch(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[rol]}`).send(cuerpo),
    post: (ruta: string) => request(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[rol]}`),
  });

  async function notificar(usuarioId: number, cantidad: number, desde = Date.parse('2026-11-02T15:00:00.000Z')) {
    const filas = Array.from({ length: cantidad }, (_, i) => ({
      usuario_id: usuarioId,
      ticket_id: ids.ticket,
      tipo: 'sla_alerta_respuesta',
      datos: JSON.stringify({ vence: '2026-11-03T15:00:00.000Z', umbral: 80 }),
      creado_en: new Date(desde + i * 60_000),
    }));
    const insertadas: { id: string }[] = await db('notificaciones').insert(filas).returning('id');
    return insertadas.map((f) => Number(f.id));
  }

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    for (const rol of ['tecnico', 'coordinador']) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@vozmuni.test`, password: PASSWORD_DESARROLLO });
      tokens[rol] = res.body.accessToken;
      ids[rol] = Number((await db('usuarios').where({ email: `${rol}@vozmuni.test` }).first('id')).id);
    }
    const vecino = Number((await db('usuarios').where({ email: 'vecino@vozmuni.test' }).first('id')).id);
    const [ticket] = await db('tickets')
      .insert({
        numero: 'Q-2026-000001',
        solicitante_id: vecino,
        registrado_por: vecino,
        categoria_id: (await db('categorias').where({ nombre: 'Baches' }).first('id')).id,
        zona_id: (await db('zonas').first('id')).id,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: 'Calle 1',
      })
      .returning('id');
    ids.ticket = Number(ticket.id);
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
  });

  it('el técnico lista sus 20 más recientes, con noLeidas y los datos del ticket', async () => {
    const propias = await notificar(ids.tecnico, 25);
    await notificar(ids.coordinador, 3);

    const res = await como('tecnico').get('/notificaciones');
    expect(res.status).toBe(200);
    expect(res.body.noLeidas).toBe(25);
    expect(res.body.datos).toHaveLength(20);
    expect(res.body.datos[0]).toEqual({
      id: propias[24],
      tipo: 'sla_alerta_respuesta',
      leida: false,
      creadoEn: new Date(Date.parse('2026-11-02T15:00:00.000Z') + 24 * 60_000).toISOString(),
      ticket: { id: ids.ticket, numero: 'Q-2026-000001', titulo: 'Bache frente a la escuela' },
      datos: { vence: '2026-11-03T15:00:00.000Z', umbral: 80 },
    });
    // Nunca incluye las de otro usuario.
    expect(res.body.datos.map((n: { id: number }) => n.id)).toEqual([...propias].reverse().slice(0, 20));
  });

  it('marcar una propia → 200 y baja noLeidas; una de otro usuario → 404', async () => {
    const [propia] = await notificar(ids.tecnico, 2);
    const [ajena] = await notificar(ids.coordinador, 1);

    const res = await como('tecnico').patch(`/notificaciones/${propia}`, { leida: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: propia, leida: true });
    expect((await como('tecnico').get('/notificaciones')).body.noLeidas).toBe(1);

    const otra = await como('tecnico').patch(`/notificaciones/${ajena}`, { leida: true });
    expect(otra.status).toBe(404);
    expect(otra.body.codigo).toBe('NO_ENCONTRADO');
    expect(await db('notificaciones').where({ id: ajena }).first('leida')).toEqual({ leida: false });
    expect((await como('tecnico').patch('/notificaciones/999999', { leida: true })).status).toBe(404);
  });

  it.each([
    ['{ leida: false }', { leida: false }],
    ['un campo extra', { leida: true, otra: 1 }],
    ['un cuerpo vacío', {}],
  ])('%s → 400 VALIDACION', async (_caso, cuerpo) => {
    const [propia] = await notificar(ids.tecnico, 1);
    const res = await como('tecnico').patch(`/notificaciones/${propia}`, cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDACION');
  });

  it('marcar-leidas deja noLeidas en 0 sin tocar las de otro usuario', async () => {
    await notificar(ids.tecnico, 3);
    await notificar(ids.coordinador, 2);
    const res = await como('tecnico').post('/notificaciones/marcar-leidas');
    expect(res.status).toBe(204);
    expect((await como('tecnico').get('/notificaciones')).body.noLeidas).toBe(0);
    expect((await como('coordinador').get('/notificaciones')).body.noLeidas).toBe(2);
  });

  it('marcar como leída fija leida_en una sola vez; marcar-leidas también (SPEC 36)', async () => {
    const [una, otra] = await notificar(ids.tecnico, 2);
    const antes = Date.now();

    await como('tecnico').patch(`/notificaciones/${una}`, { leida: true });
    const { leida_en: primera } = await db('notificaciones').where({ id: una }).first('leida_en');
    expect(primera.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    await como('tecnico').patch(`/notificaciones/${una}`, { leida: true });
    expect(await db('notificaciones').where({ id: una }).first('leida_en')).toEqual({ leida_en: primera });

    await como('tecnico').post('/notificaciones/marcar-leidas');
    expect((await db('notificaciones').where({ id: otra }).first('leida_en')).leida_en).toBeInstanceOf(Date);
  });

  describe('purga de las leídas (SPEC 36)', () => {
    const AHORA = new Date('2026-12-15T09:00:00.000Z');
    const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

    afterEach(async () => {
      jest.restoreAllMocks();
      await db('parametros').where({ clave: 'notificaciones_retencion_dias' }).update({ valor: JSON.stringify(30) });
    });

    it('borra las leídas con leida_en de hace más de 30 días y conserva las recientes y todas las no leídas', async () => {
      const [vieja, reciente, borde, noLeidaVieja] = await notificar(ids.tecnico, 4, haceDias(90).getTime());
      await db('notificaciones').where({ id: vieja }).update({ leida: true, leida_en: haceDias(31) });
      await db('notificaciones').where({ id: reciente }).update({ leida: true, leida_en: haceDias(2) });
      await db('notificaciones').where({ id: borde }).update({ leida: true, leida_en: haceDias(30) });

      expect(await container.notificacionesService.purgarLeidas(AHORA)).toBe(1);

      const quedan = (await db('notificaciones').orderBy('id').select('id')).map((f: { id: string }) => Number(f.id));
      expect(quedan).toEqual([reciente, borde, noLeidaVieja]);
    });

    it('con el parámetro inválido no borra nada y registra el error', async () => {
      const errores = jest.spyOn(console, 'error').mockImplementation(() => {});
      const [vieja] = await notificar(ids.tecnico, 1);
      await db('notificaciones').where({ id: vieja }).update({ leida: true, leida_en: haceDias(400) });
      await db('parametros').where({ clave: 'notificaciones_retencion_dias' }).update({ valor: JSON.stringify(0) });

      expect(await container.notificacionesService.purgarLeidas(AHORA)).toBe(0);

      expect(await db('notificaciones').where({ id: vieja }).first('id')).toBeDefined();
      expect(errores).toHaveBeenCalledWith(expect.stringContaining('notificaciones_retencion_dias'));
    });
  });

  it('sin sesión → 401 en las tres rutas', async () => {
    expect((await request(app).get('/api/v1/notificaciones')).status).toBe(401);
    expect((await request(app).patch('/api/v1/notificaciones/1').send({ leida: true })).status).toBe(401);
    expect((await request(app).post('/api/v1/notificaciones/marcar-leidas')).status).toBe(401);
  });
});
