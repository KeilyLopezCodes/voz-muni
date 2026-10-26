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

const BASE = Date.parse('2026-11-02T15:00:00.000Z');
const minuto = (n: number) => new Date(BASE + n * 60_000);

describe('GET /api/v1/tickets/escaladas (SPEC 32)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const t: Record<string, number> = {};
  let correlativo = 1;

  async function ticket(estado: EstadoTicket, escaladoEn: Date | null, cambios: Record<string, unknown> = {}): Promise<number> {
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
        vence_respuesta: minuto(-60),
        vence_resolucion: minuto(600),
        escalado: escaladoEn !== null,
        escalado_en: escaladoEn,
        escalado_por: escaladoEn === null ? null : 'respuesta',
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const get = (rol: string, query = '') =>
    request(app).get(`/api/v1/tickets/escaladas${query}`).set('Authorization', `Bearer ${tokens[rol]}`);

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    for (const rol of ['vecino', 'tecnico', 'coordinador', 'supervisor', 'administrador']) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@vozmuni.test`, password: PASSWORD_DESARROLLO });
      tokens[rol] = res.body.accessToken;
      ids[rol] = Number((await db('usuarios').where({ email: `${rol}@vozmuni.test` }).first('id')).id);
    }
    ids.obras = Number((await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id')).id);
    ids.otra = Number((await db('dependencias').whereNot({ id: ids.obras }).first('id')).id);
    ids.baches = Number((await db('categorias').where({ nombre: 'Baches' }).first('id')).id);
    ids.zona = Number((await db('zonas').first('id')).id);

    // Insertadas en otro orden que el de escalado_en.
    t.espera = await ticket('en_espera', minuto(30), { vence_resolucion: null, sla_pausado_desde: minuto(20), sla_restante_minutos: 90 });
    t.asignada = await ticket('asignada', minuto(10));
    t.revision = await ticket('en_revision', minuto(40), { dependencia_id: null, asignado_a: null });
    t.proceso = await ticket('en_proceso', minuto(20), { dependencia_id: ids.otra, escalado_por: 'resolucion' });
    t.resuelta = await ticket('resuelta', minuto(5), { resuelto_en: minuto(50) });
    t.cerrada = await ticket('cerrada', minuto(6), { cerrado_en: minuto(50) });
    t.sinEscalar = await ticket('asignada', null);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  it('el supervisor ve las escaladas en los 4 estados activos, ordenadas por escalado_en, con escaladoPor y sla', async () => {
    const res = await get('supervisor');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, tamano: 20, total: 4 });
    expect(res.body.datos.map((x: { id: number }) => x.id)).toEqual([t.asignada, t.proceso, t.espera, t.revision]);
    expect(res.body.datos[0]).toEqual({
      id: t.asignada,
      numero: expect.stringMatching(/^Q-2026-\d{6}$/),
      titulo: 'Bache frente a la escuela',
      estado: 'asignada',
      prioridad: 'alta',
      categoria: { id: ids.baches, nombre: 'Baches' },
      dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
      tecnico: { id: ids.tecnico, nombre: expect.any(String) },
      escaladoEn: minuto(10).toISOString(),
      escaladoPor: 'respuesta',
      sla: {
        venceRespuesta: minuto(-60).toISOString(),
        primeraRespuestaEn: null,
        venceResolucion: minuto(600).toISOString(),
        pausado: false,
        restanteMinutosEnPausa: null,
        escalado: true,
        escaladoEn: minuto(10).toISOString(),
        escaladoPor: 'respuesta',
      },
    });
    expect(res.body.datos[1].escaladoPor).toBe('resolucion');
    expect(res.body.datos[2].sla).toMatchObject({ pausado: true, restanteMinutosEnPausa: 90 });
    expect(res.body.datos[3]).toMatchObject({ estado: 'en_revision', dependencia: null, tecnico: null });
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('vecino@vozmuni.test');
    expect(texto).not.toContain('"dpi"');
  });

  it('dependenciaId filtra y deja fuera las que están en revisión sin dependencia', async () => {
    const res = await get('supervisor', `?dependenciaId=${ids.obras}`);
    expect(res.status).toBe(200);
    expect(res.body.datos.map((x: { id: number }) => x.id)).toEqual([t.asignada, t.espera]);
    expect(res.body.total).toBe(2);
  });

  it('la paginación devuelve total', async () => {
    const primera = await get('supervisor', '?tamano=3');
    const segunda = await get('supervisor', '?tamano=3&pagina=2');
    expect(primera.body).toMatchObject({ total: 4, tamano: 3 });
    expect(primera.body.datos).toHaveLength(3);
    expect(segunda.body.datos.map((x: { id: number }) => x.id)).toEqual([t.revision]);
  });

  it.each([
    ['tamano = 51', '?tamano=51'],
    ['un parámetro desconocido', '?estado=asignada'],
  ])('%s → 400 VALIDACION', async (_caso, query) => {
    const res = await get('supervisor', query);
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDACION');
  });

  it.each(['tecnico', 'coordinador', 'vecino', 'administrador'])('%s → 403', async (rol) => {
    const res = await get(rol);
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('PERMISO_DENEGADO');
  });

  it('sin sesión → 401', async () => {
    expect((await request(app).get('/api/v1/tickets/escaladas')).status).toBe(401);
  });

  it('las bandejas de los internos llevan la marca en sla', async () => {
    const res = await request(app)
      .get('/api/v1/tickets/atencion?estado=todas')
      .set('Authorization', `Bearer ${tokens.coordinador}`);
    const asignada = res.body.datos.find((x: { id: number }) => x.id === t.asignada);
    expect(asignada.sla).toMatchObject({ escalado: true, escaladoEn: minuto(10).toISOString(), escaladoPor: 'respuesta' });
  });
});
