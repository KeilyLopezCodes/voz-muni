import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import { createTestKnex, envDePrueba, reiniciarEsquema, vaciarBitacora } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MINUTO = 60 * 1000;

// App real (Knex, bcrypt, JWT) contra la base de pruebas.
function crearContainer(loginLimitePorVentana: number): Container {
  return buildContainer(envDePrueba({ LOGIN_LIMITE_POR_VENTANA: loginLimitePorVentana }));
}

describe('API de autenticación /api/v1/auth', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let passwordHash: string;

  beforeAll(async () => {
    db = createTestKnex();
    container = crearContainer(1000);
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    // Costo bajo solo en los datos de prueba: bcrypt lee el costo del propio hash.
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  // No deja usuarios: así las demás suites pueden revertir 0006_roles.
  afterAll(async () => {
    try {
      await db('sesiones').delete();
      await db('correos_salientes').delete(); // apunta a usuarios y tickets (SPEC 34)
      await vaciarBitacora(db); // la bitácora apunta a usuarios (SPEC 41 y 42)
      await db('usuarios').delete();
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db('sesiones').delete();
    await db('correos_salientes').delete(); // apunta a usuarios y tickets (SPEC 34)
    await vaciarBitacora(db); // la bitácora apunta a usuarios (SPEC 41 y 42)
    await db('usuarios').delete();
  });

  async function crearUsuario(email: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: 'coordinador' }).first('id');
    const [fila] = await db('usuarios')
      .insert({ nombre: 'Ana Coordinadora', email, rol_id: rolId, password_hash: passwordHash, correo_verificado_en: new Date(), ...cambios })
      .returning('id');
    return Number(fila.id);
  }

  function login(email: string, password: string = PASSWORD) {
    return request(app).post('/api/v1/auth/login').send({ email, password });
  }

  describe('POST /login', () => {
    it('con credenciales correctas responde 200 con los dos tokens y sus vencimientos', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const antes = Date.now();

      const res = await login('ana@vozmuni.test');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        accessExpiraEn: expect.stringMatching(ISO_UTC),
        refreshToken: expect.any(String),
        refreshExpiraEn: expect.stringMatching(ISO_UTC),
        usuario: { id, nombre: 'Ana Coordinadora', rol: 'coordinador', dependenciaId: null },
      });
      const acceso = Date.parse(res.body.accessExpiraEn) - antes;
      const renovacion = Date.parse(res.body.refreshExpiraEn) - antes;
      expect(acceso).toBeGreaterThan(14 * MINUTO);
      // Margen por lo que tarda la petición: el servidor emite el token después de medir `antes`.
      expect(acceso).toBeLessThanOrEqual(15 * MINUTO + 5000);
      expect(renovacion).toBeGreaterThan(7 * 24 * 60 * MINUTO - MINUTO);
      expect(renovacion).toBeLessThanOrEqual(7 * 24 * 60 * MINUTO + MINUTO);
    });

    it('inicia sesión con el correo en mayúsculas', async () => {
      await crearUsuario('ana@vozmuni.test');

      const res = await login('ANA@VozMuni.test');

      expect(res.status).toBe(200);
    });

    it('sesiones.token_hash guarda el SHA-256 del token, nunca el token en claro', async () => {
      await crearUsuario('ana@vozmuni.test');
      const { body } = await login('ana@vozmuni.test');

      const sesiones: { token_hash: string }[] = await db('sesiones').select('token_hash');

      expect(sesiones).toHaveLength(1);
      expect(sesiones[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(sesiones[0].token_hash).not.toBe(body.refreshToken);
      expect(sesiones[0].token_hash).not.toContain(body.refreshToken);
    });

    it('contraseña incorrecta, correo inexistente, usuario inactivo y sin contraseña responden el mismo 401', async () => {
      await crearUsuario('ana@vozmuni.test');
      await crearUsuario('inactivo@vozmuni.test', { activo: false });
      await crearUsuario('sinclave@vozmuni.test', { password_hash: null });

      const respuestas = [
        await login('ana@vozmuni.test', 'incorrecta'),
        await login('nadie@vozmuni.test'),
        await login('inactivo@vozmuni.test'),
        await login('sinclave@vozmuni.test'),
      ];

      for (const res of respuestas) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual(respuestas[0].body);
      }
      expect(respuestas[0].body).toEqual({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: expect.any(String) });
    });

    it('el 5.º fallo responde 423 y la contraseña correcta también hasta que vence el bloqueo', async () => {
      const id = await crearUsuario('ana@vozmuni.test');

      for (let i = 0; i < 4; i++) {
        expect((await login('ana@vozmuni.test', 'incorrecta')).status).toBe(401);
      }
      const quinto = await login('ana@vozmuni.test', 'incorrecta');
      expect(quinto.status).toBe(423);
      expect(quinto.body).toEqual({ codigo: 'CUENTA_BLOQUEADA', mensaje: expect.any(String) });

      const correcta = await login('ana@vozmuni.test');
      expect(correcta.status).toBe(423);

      // Simula que pasaron los 15 minutos.
      await db('usuarios')
        .where({ id })
        .update({ bloqueado_hasta: new Date(Date.now() - 1000) });
      expect((await login('ana@vozmuni.test')).status).toBe(200);
      expect(await db('usuarios').where({ id }).first('intentos_fallidos', 'bloqueado_hasta')).toEqual({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      });
    });

    it('un cuerpo inválido responde 400 VALIDACION', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'no-es-correo', password: '' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String) });
    });

    it('con LOGIN_LIMITE_POR_VENTANA=2 la 3.ª petición responde 429', async () => {
      const limitado = crearContainer(2);
      try {
        const appLimitada = createApp(limitado);
        const intentar = () =>
          request(appLimitada).post('/api/v1/auth/login').send({ email: 'nadie@vozmuni.test', password: 'x' });

        expect((await intentar()).status).toBe(401);
        expect((await intentar()).status).toBe(401);
        const tercera = await intentar();
        expect(tercera.status).toBe(429);
        expect(tercera.body).toEqual({ codigo: 'DEMASIADAS_PETICIONES', mensaje: expect.any(String) });
      } finally {
        await limitado.dispose();
      }
    });
  });

  describe('POST /refresh', () => {
    it('devuelve tokens nuevos y el refreshToken anterior deja de servir', async () => {
      await crearUsuario('ana@vozmuni.test');
      const { body: sesion } = await login('ana@vozmuni.test');

      const renovada = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: sesion.refreshToken });

      expect(renovada.status).toBe(200);
      expect(renovada.body.refreshToken).not.toBe(sesion.refreshToken);
      expect(renovada.body.accessToken).toEqual(expect.any(String));

      // Usar otra vez el anterior es reuso.
      const anterior = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: sesion.refreshToken });
      expect(anterior.status).toBe(401);
      expect(anterior.body).toEqual({ codigo: 'SESION_INVALIDA', mensaje: expect.any(String) });
    });

    it('reusar un refreshToken rotado revoca todas las sesiones del usuario', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const { body: primera } = await login('ana@vozmuni.test');
      const { body: otra } = await login('ana@vozmuni.test');
      const { body: rotada } = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: primera.refreshToken });

      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: primera.refreshToken })).status).toBe(401);

      const activas = await db('sesiones').where({ usuario_id: id }).whereNull('revocada_en');
      expect(activas).toHaveLength(0);
      for (const token of [otra.refreshToken, rotada.refreshToken]) {
        expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token })).status).toBe(401);
      }
    });

    it('un refreshToken inexistente responde 401 SESION_INVALIDA', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'no-existe' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ codigo: 'SESION_INVALIDA', mensaje: expect.any(String) });
    });
  });

  describe('POST /logout', () => {
    it('responde 204 y después refresh con ese token responde 401', async () => {
      await crearUsuario('ana@vozmuni.test');
      const { body: sesion } = await login('ana@vozmuni.test');

      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: sesion.refreshToken });

      expect(res.status).toBe(204);
      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: sesion.refreshToken })).status).toBe(401);
    });

    it('responde 204 con un token ya revocado o inexistente', async () => {
      await crearUsuario('ana@vozmuni.test');
      const { body: sesion } = await login('ana@vozmuni.test');
      await request(app).post('/api/v1/auth/logout').send({ refreshToken: sesion.refreshToken });

      expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken: sesion.refreshToken })).status).toBe(204);
      expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'no-existe' })).status).toBe(204);
    });

    it('sin refreshToken responde 400 VALIDACION', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String) });
    });
  });

  describe('GET /sesion', () => {
    it('devuelve el usuario y los permisos de su rol cargados por 0006_roles', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const { body: sesion } = await login('ana@vozmuni.test');

      const res = await request(app).get('/api/v1/auth/sesion').set('Authorization', `Bearer ${sesion.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        usuario: { id, nombre: 'Ana Coordinadora', rol: 'coordinador', dependenciaId: null },
        permisos: {
          'tickets.ver': 'dependencia',
          'tickets.clasificar': 'todas',
          'tickets.asignar': 'dependencia',
          'tickets.trasladar': 'solicitar',
          'tickets.cambiar_estado': 'dependencia',
          'comentarios.publico': 'si',
          'comentarios.interno': 'si',
          'reportes.ver': 'dependencia',
          'bitacora.ver': 'dependencia',
        },
      });
    });

    it('sin token responde 401 NO_AUTENTICADO', async () => {
      const res = await request(app).get('/api/v1/auth/sesion');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String) });
    });

    it('con un token mal formado responde 401 TOKEN_INVALIDO', async () => {
      const res = await request(app).get('/api/v1/auth/sesion').set('Authorization', 'Bearer no-es-un-jwt');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ codigo: 'TOKEN_INVALIDO', mensaje: expect.any(String) });
    });

    it('responde 401 si el usuario se desactiva después de emitido el token', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const { body: sesion } = await login('ana@vozmuni.test');
      await db('usuarios').where({ id }).update({ activo: false });

      const res = await request(app).get('/api/v1/auth/sesion').set('Authorization', `Bearer ${sesion.accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.codigo).toBe('TOKEN_INVALIDO');
    });
  });
});
