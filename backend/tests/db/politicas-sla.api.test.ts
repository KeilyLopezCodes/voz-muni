import path from 'node:path';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { CategoriaSlaDto } from '../../src/application/services/politicas-sla.service';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');
const PASSWORD_DESARROLLO = 'Desarrollo2026';

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(_mensaje: MensajeCorreo): Promise<void> {}
}

const MATRIZ = [
  { prioridad: 'urgente', horasRespuesta: 4, horasResolucion: 12 },
  { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 40 },
  { prioridad: 'media', horasRespuesta: 16, horasResolucion: 80 },
  { prioridad: 'baja', horasRespuesta: 40, horasResolucion: 160 },
];

describe('Políticas de SLA (SPEC 29)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};

  const get = (rol = 'administrador') =>
    request(app).get('/api/v1/admin/politicas-sla').set('Authorization', `Bearer ${tokens[rol]}`);
  const put = (categoriaId: number, cuerpo: unknown, rol = 'administrador') =>
    request(app)
      .put(`/api/v1/admin/categorias/${categoriaId}/politicas-sla`)
      .set('Authorization', `Bearer ${tokens[rol]}`)
      .send(cuerpo as object);
  const filas = (categoriaId: number) =>
    db('politicas_sla')
      .where({ categoria_id: categoriaId })
      .orderBy('prioridad')
      .select('prioridad', 'horas_respuesta', 'horas_resolucion', 'actualizado_por');

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    for (const rol of ['vecino', 'tecnico', 'coordinador', 'supervisor', 'administrador']) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${rol}@vozmuni.test`, password: PASSWORD_DESARROLLO });
      expect(res.status).toBe(200);
      tokens[rol] = res.body.accessToken;
    }
    const { id: adminId } = await db('usuarios').where({ email: 'administrador@vozmuni.test' }).first('id');
    ids.administrador = Number(adminId);
    const { id: obrasId } = await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id');
    ids.obras = Number(obrasId);

    const [sinSla] = await db('categorias').insert({ nombre: 'Aceras', dependencia_id: ids.obras }).returning('id');
    ids.sinSla = Number(sinSla.id);
    const [sueltas] = await db('categorias').insert({ nombre: 'Señalización', dependencia_id: ids.obras }).returning('id');
    ids.sueltas = Number(sueltas.id);
    await db('politicas_sla').insert([
      { categoria_id: ids.sueltas, prioridad: 'urgente', horas_respuesta: 1, horas_resolucion: 10 },
      { categoria_id: ids.sueltas, prioridad: 'baja', horas_respuesta: 50, horas_resolucion: 500 },
    ]);
    const [inactiva] = await db('categorias')
      .insert({ nombre: 'Zancudos', dependencia_id: ids.obras, activa: false })
      .returning('id');
    ids.inactiva = Number(inactiva.id);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  describe('GET /api/v1/admin/politicas-sla', () => {
    it('lista todas las categorías ordenadas por nombre; las de seed:dev completas y sin autor', async () => {
      const res = await get();
      expect(res.status).toBe(200);
      const datos: CategoriaSlaDto[] = res.body.datos;
      const nombres = datos.map((c) => c.categoria.nombre);
      expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
      expect(nombres).toEqual(expect.arrayContaining(['Agua potable', 'Alumbrado público', 'Baches', 'Recolección de basura']));

      const baches = datos.find((c) => c.categoria.nombre === 'Baches')!;
      expect(baches).toMatchObject({
        categoria: { nombre: 'Baches', activa: true },
        dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
        completa: true,
        actualizadoPor: null,
        actualizadoEn: expect.any(String),
      });
      // En el orden de PRIORIDADES: de baja a urgente.
      expect(baches.plazos).toEqual([
        { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
        { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
        { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
        { prioridad: 'urgente', horasRespuesta: 2, horasResolucion: 24 },
      ]);
    });

    it('una categoría sin políticas aparece incompleta y sin plazos', async () => {
      const aceras = (await get()).body.datos.find((c: CategoriaSlaDto) => c.categoria.id === ids.sinSla);
      expect(aceras).toMatchObject({ completa: false, plazos: [], actualizadoEn: null, actualizadoPor: null });
    });
  });

  describe('PUT /api/v1/admin/categorias/:id/politicas-sla', () => {
    it('una categoría con 2 filas sueltas queda con las 4, completa y con el administrador como autor', async () => {
      const res = await put(ids.sueltas, { plazos: MATRIZ });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        categoria: { id: ids.sueltas, nombre: 'Señalización' },
        completa: true,
        actualizadoPor: { id: ids.administrador, nombre: expect.any(String) },
        actualizadoEn: expect.any(String),
      });
      expect(res.body.plazos.map((p: { prioridad: string }) => p.prioridad)).toEqual(['baja', 'media', 'alta', 'urgente']);
      const guardadas = await filas(ids.sueltas);
      expect(guardadas).toHaveLength(4);
      expect(guardadas.every((f) => Number(f.actualizado_por) === ids.administrador)).toBe(true);
      expect(guardadas.find((f) => f.prioridad === 'urgente')).toMatchObject({ horas_respuesta: 4, horas_resolucion: 12 });
    });

    it.each([
      ['3 plazos', { plazos: MATRIZ.slice(0, 3) }],
      ['un campo extra en un plazo', { plazos: [{ ...MATRIZ[0], extra: 1 }, ...MATRIZ.slice(1)] }],
      ['un campo extra en el cuerpo', { plazos: MATRIZ, otra: true }],
      ['horas como texto', { plazos: [{ ...MATRIZ[0], horasRespuesta: '4' }, ...MATRIZ.slice(1)] }],
      ['una prioridad desconocida', { plazos: [{ ...MATRIZ[0], prioridad: 'critica' }, ...MATRIZ.slice(1)] }],
    ])('%s → 400 VALIDACION', async (_caso, cuerpo) => {
      const res = await put(ids.sinSla, cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });

    it('una matriz no monótona → 400 MATRIZ_SLA_INVALIDA con detalles, y la base no cambia', async () => {
      const antes = await filas(ids.sueltas);
      const plazos = MATRIZ.map((p) => (p.prioridad === 'alta' ? { ...p, horasResolucion: 100 } : p));
      const res = await put(ids.sueltas, { plazos });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        codigo: 'MATRIZ_SLA_INVALIDA',
        detalles: [{ prioridad: 'media', campo: 'horasResolucion', problema: 'NO_MONOTONA' }],
      });
      expect(await filas(ids.sueltas)).toEqual(antes);
    });

    it('reporta todos los detalles a la vez', async () => {
      const plazos = [
        { prioridad: 'urgente', horasRespuesta: 0, horasResolucion: 12 },
        { prioridad: 'alta', horasRespuesta: 50, horasResolucion: 40 },
        { prioridad: 'media', horasRespuesta: 16, horasResolucion: 80 },
        { prioridad: 'media', horasRespuesta: 16, horasResolucion: 80 },
      ];
      const res = await put(ids.sinSla, { plazos });
      expect(res.status).toBe(400);
      expect(res.body.detalles).toEqual(
        expect.arrayContaining([
          { prioridad: 'media', campo: null, problema: 'PRIORIDAD_DUPLICADA' },
          { prioridad: 'baja', campo: null, problema: 'PRIORIDAD_FALTANTE' },
          { prioridad: 'urgente', campo: 'horasRespuesta', problema: 'HORAS_INVALIDAS' },
          { prioridad: 'alta', campo: 'horasRespuesta', problema: 'RESPUESTA_MAYOR_QUE_RESOLUCION' },
        ]),
      );
      expect(await filas(ids.sinSla)).toEqual([]);
    });

    it('una categoría inexistente → 404', async () => {
      const res = await put(999999, { plazos: MATRIZ });
      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe('NO_ENCONTRADO');
    });

    it('una categoría inactiva → 200', async () => {
      const res = await put(ids.inactiva, { plazos: MATRIZ });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ categoria: { activa: false }, completa: true });
    });

    it('no modifica ninguna fila de tickets', async () => {
      const { id: vecinoId } = await db('usuarios').where({ email: 'vecino@vozmuni.test' }).first('id');
      const { id: zonaId } = await db('zonas').first('id');
      await db('tickets').insert({
        numero: 'Q-2026-000001',
        solicitante_id: vecinoId,
        registrado_por: vecinoId,
        categoria_id: ids.sinSla,
        dependencia_id: ids.obras,
        zona_id: zonaId,
        canal: 'portal',
        titulo: 'Acera rota',
        descripcion: 'La acera está levantada frente al parque',
        direccion: 'Calle 1',
        estado: 'asignada',
        prioridad: 'alta',
      });
      const antes = await db('tickets').select('*');
      expect((await put(ids.sinSla, { plazos: MATRIZ })).status).toBe(200);
      expect(await db('tickets').select('*')).toEqual(antes);
      await db('tickets').del();
    });
  });

  describe('autorización', () => {
    it.each(['vecino', 'tecnico', 'coordinador', 'supervisor'])('%s → 403 en los dos endpoints', async (rol) => {
      expect((await get(rol)).status).toBe(403);
      const res = await put(ids.sinSla, { plazos: MATRIZ }, rol);
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('PERMISO_DENEGADO');
    });

    it('sin sesión → 401 en los dos endpoints', async () => {
      expect((await request(app).get('/api/v1/admin/politicas-sla')).status).toBe(401);
      expect((await request(app).put(`/api/v1/admin/categorias/${ids.sinSla}/politicas-sla`).send({ plazos: MATRIZ })).status).toBe(
        401,
      );
    });
  });
});
