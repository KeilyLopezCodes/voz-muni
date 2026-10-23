import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

// Cajas de prueba: datos de la prueba, no configuración del sistema.
const CAJA = { latMin: 14.55, latMax: 14.7, lngMin: -90.6, lngMax: -90.45 };
const OTRA_CAJA = { latMin: 14.0, latMax: 14.2, lngMin: -91.0, lngMax: -90.8 };

describe('Límites del municipio y coordenadas de la queja (SPEC 15)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [dependencia] = await db('dependencias').insert({ nombre: 'Obras' }).returning('id');
    const [categoria] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: dependencia.id }).returning('id');
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.categoria = Number(categoria.id);
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ['administrador', 'vecino', 'receptor', 'supervisor', 'tecnico']) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${rol}`,
          email: `${rol}@mapa.test`,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: rol === 'tecnico' ? dependencia.id : null,
        })
        .returning('id');
      ids[rol] = Number(fila.id);
      tokens[rol] = (await request(app).post('/api/v1/auth/login').send({ email: `${rol}@mapa.test`, password: PASSWORD })).body.accessToken;
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

  const leer = (quien = 'vecino') =>
    request(app).get('/api/v1/parametros/limites-municipio').set('Authorization', `Bearer ${tokens[quien]}`);
  const guardar = (caja: unknown, quien = 'administrador') =>
    request(app)
      .put('/api/v1/admin/parametros/limites-municipio')
      .set('Authorization', `Bearer ${tokens[quien]}`)
      .send(caja as object);
  const registrar = (quien: string, extra: object) =>
    request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens[quien]}`)
      .send({
        categoriaId: ids.categoria,
        zonaId: ids.zona,
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        ...(quien === 'vecino' ? {} : { solicitanteId: ids.vecino, canal: 'telefono' }),
        ...extra,
      });

  // Las pruebas siguen un orden: primero sin configuración, después con la caja guardada.
  describe('sin configuración', () => {
    it('GET devuelve { limites: null }', async () => {
      const res = await leer();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ limites: null });
    });

    it('una queja con coordenadas → 400 UBICACION_NO_CONFIGURADA, y sin coordenadas se registra', async () => {
      const conCoordenadas = await registrar('vecino', { lat: 14.6, lng: -90.5 });
      expect(conCoordenadas.status).toBe(400);
      expect(conCoordenadas.body.codigo).toBe('UBICACION_NO_CONFIGURADA');

      expect((await registrar('vecino', {})).status).toBe(201);
    });
  });

  describe('PUT /admin/parametros/limites-municipio', () => {
    it('el administrador guarda la caja y el GET siguiente la devuelve', async () => {
      const res = await guardar(CAJA);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ limites: CAJA });
      expect((await leer('supervisor')).body).toEqual({ limites: CAJA });
    });

    it.each(['vecino', 'receptor', 'supervisor', 'tecnico'])('el %s recibe 403', async (quien) => {
      expect((await guardar(CAJA, quien)).status).toBe(403);
    });

    it.each([
      ['latMin ≥ latMax', { ...CAJA, latMin: 14.7 }],
      ['lngMin ≥ lngMax', { ...CAJA, lngMin: -90.45 }],
      ['fuera de los rangos del planeta', { ...CAJA, latMax: 91 }],
      ['una propiedad faltante', { latMin: 14.55, latMax: 14.7, lngMin: -90.6 }],
    ])('%s → 400 LIMITES_INVALIDOS', async (_caso, caja) => {
      const res = await guardar(caja);

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('LIMITES_INVALIDOS');
    });

    it('GET exige sesión y tickets.crear', async () => {
      expect((await request(app).get('/api/v1/parametros/limites-municipio')).status).toBe(401);
      expect((await leer('tecnico')).status).toBe(403);
    });
  });

  describe('POST /tickets con coordenadas', () => {
    it('el vecino registra con un punto dentro → 201, con lat y lng redondeadas', async () => {
      const res = await registrar('vecino', { lat: 14.6012345, lng: -90.5 });

      expect(res.status).toBe(201);
      expect(await db('tickets').where({ id: res.body.id }).first('lat', 'lng')).toEqual({ lat: '14.601235', lng: '-90.500000' });
    });

    it('un punto en el borde se acepta', async () => {
      expect((await registrar('vecino', { lat: CAJA.latMax, lng: CAJA.lngMin })).status).toBe(201);
    });

    it.each([
      ['un punto fuera', { lat: 14.8, lng: -90.5 }, 'UBICACION_FUERA_DEL_MUNICIPIO'],
      ['solo lat', { lat: 14.6 }, 'UBICACION_INCOMPLETA'],
      ['solo lng', { lng: -90.5 }, 'UBICACION_INCOMPLETA'],
      ['lat = 91', { lat: 91, lng: -90.5 }, 'UBICACION_INVALIDA'],
      ['lat en texto', { lat: '14.6', lng: -90.5 }, 'VALIDACION'],
    ])('%s → 400 %s', async (_caso, extra, codigo) => {
      const res = await registrar('vecino', extra);

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe(codigo);
    });

    it.each(['receptor', 'supervisor'])('el %s registra con coordenadas → 201', async (quien) => {
      const res = await registrar(quien, { lat: 14.65, lng: -90.55 });

      expect(res.status).toBe(201);
      expect(await db('tickets').where({ id: res.body.id }).first('lat', 'lng')).toEqual({ lat: '14.650000', lng: '-90.550000' });
    });

    it('cambiar la caja no modifica las coordenadas de los tickets existentes', async () => {
      const antes = await db('tickets').whereNotNull('lat').orderBy('id').select('id', 'lat', 'lng');
      expect(antes.length).toBeGreaterThan(0);

      expect((await guardar(OTRA_CAJA)).status).toBe(200);

      expect(await db('tickets').whereNotNull('lat').orderBy('id').select('id', 'lat', 'lng')).toEqual(antes);
      // La caja nueva aplica a los registros siguientes.
      expect((await registrar('vecino', { lat: 14.6, lng: -90.5 })).body.codigo).toBe('UBICACION_FUERA_DEL_MUNICIPIO');
    });
  });
});
