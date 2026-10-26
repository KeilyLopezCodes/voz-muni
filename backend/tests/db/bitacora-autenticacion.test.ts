import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema, vaciarBitacora } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const NUEVA = 'Clave-nueva-2026';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

interface FilaBitacora {
  accion: string;
  entidad: string;
  entidad_id: string | null;
  usuario_id: string | null;
  dependencia_id: string | null;
  ip: string | null;
  detalle: { cambios?: Record<string, { antes: unknown; despues: unknown }>; datos?: Record<string, unknown> };
}

// Autenticación en la bitácora (SPEC 42) contra PostgreSQL: SPEC 08, 09, 10, 13 y 16.
describe('Bitácora de autenticación (SPEC 42)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  let passwordHash: string;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    passwordHash = await bcrypt.hash(PASSWORD, 4);
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
    enviador.enviados.length = 0;
    await vaciarBitacora(db); // la bitácora apunta a usuarios (SPEC 41)
    await db('sesiones').delete();
    await db('restablecimientos').delete();
    await db('correos_salientes').delete();
    await db('usuarios').delete();
  });

  async function crearUsuario(email: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: 'coordinador' }).first('id');
    const { id: depId } =
      (await db('dependencias').first('id')) ?? (await db('dependencias').insert({ nombre: 'Obras' }).returning('id'))[0];
    const [fila] = await db('usuarios')
      .insert({
        nombre: 'Ana Coordinadora',
        email,
        rol_id: rolId,
        dependencia_id: depId,
        password_hash: passwordHash,
        correo_verificado_en: new Date(),
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const registros = (): Promise<FilaBitacora[]> =>
    db('bitacora')
      .orderBy('id')
      .select('accion', 'entidad', 'entidad_id', 'usuario_id', 'dependencia_id', db.raw('host(ip) as ip'), 'detalle');
  const acciones = async () => (await registros()).map((r) => r.accion);
  const login = (email: string, password = PASSWORD) => request(app).post('/api/v1/auth/login').send({ email, password });

  describe('inicio y cierre de sesión (SPEC 08)', () => {
    it('un inicio correcto deja sesion.iniciar con la IP, global', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      expect((await login('ana@vozmuni.test')).status).toBe(200);

      const [registro] = await registros();
      expect(registro).toMatchObject({
        accion: 'sesion.iniciar',
        entidad: 'usuario',
        entidad_id: String(id),
        usuario_id: String(id),
        dependencia_id: null,
      });
      expect(registro.ip).not.toBeNull();
      expect(await acciones()).toEqual(['sesion.iniciar']);
    });

    it('una contraseña incorrecta deja sesion.fallar con el motivo y los intentos, y sigue respondiendo 401', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const res = await login('ana@vozmuni.test', 'Incorrecta-1');

      expect(res.status).toBe(401);
      expect(res.body.codigo).toBe('CREDENCIALES_INVALIDAS');
      expect(await registros()).toEqual([
        expect.objectContaining({
          accion: 'sesion.fallar',
          usuario_id: String(id),
          dependencia_id: null,
          detalle: { datos: { motivo: 'password_incorrecta', intentos: 1 } },
        }),
      ]);
    });

    it('el quinto fallo deja sesion.fallar y sesion.bloquear; después, cuenta_bloqueada con 423', async () => {
      await crearUsuario('ana@vozmuni.test');
      for (let i = 0; i < 4; i++) {
        expect((await login('ana@vozmuni.test', 'Incorrecta-1')).status).toBe(401);
      }
      expect((await login('ana@vozmuni.test', 'Incorrecta-1')).status).toBe(423);

      const todos = await registros();
      expect(todos.map((r) => r.accion)).toEqual([...Array(5).fill('sesion.fallar'), 'sesion.bloquear']);
      expect(todos[4].detalle.datos).toEqual({ motivo: 'password_incorrecta', intentos: 5 });
      expect(todos[5].detalle.datos).toEqual({ bloqueadoHasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });

      // Con la cuenta bloqueada, ni con la contraseña correcta.
      expect((await login('ana@vozmuni.test')).status).toBe(423);
      expect((await registros()).at(-1)).toMatchObject({
        accion: 'sesion.fallar',
        detalle: { datos: { motivo: 'cuenta_bloqueada', intentos: 0 } },
      });
    });

    it('una cuenta inactiva o sin contraseña deja sesion.fallar con cuenta_inactiva, con 401', async () => {
      await crearUsuario('inactiva@vozmuni.test', { activo: false });
      await crearUsuario('invitada@vozmuni.test', { password_hash: null });

      expect((await login('inactiva@vozmuni.test')).status).toBe(401);
      expect((await login('invitada@vozmuni.test')).status).toBe(401);
      expect((await registros()).map((r) => r.detalle.datos?.motivo)).toEqual(['cuenta_inactiva', 'cuenta_inactiva']);
    });

    it('un correo inexistente no deja nada', async () => {
      expect((await login('nadie@vozmuni.test')).status).toBe(401);
      expect(await registros()).toEqual([]);
    });

    it('cerrar sesión deja sesion.cerrar; renovar el token no deja nada', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const { refreshToken } = (await login('ana@vozmuni.test')).body;

      const renovada = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(renovada.status).toBe(200);
      expect(await acciones()).toEqual(['sesion.iniciar']);

      await request(app).post('/api/v1/auth/logout').send({ refreshToken: renovada.body.refreshToken });
      expect((await registros()).at(-1)).toMatchObject({ accion: 'sesion.cerrar', usuario_id: String(id), dependencia_id: null });

      // Un token ya revocado no deja un segundo cierre.
      await request(app).post('/api/v1/auth/logout').send({ refreshToken: renovada.body.refreshToken });
      expect(await acciones()).toEqual(['sesion.iniciar', 'sesion.cerrar']);
    });

    it('ningún registro contiene la contraseña y todos son globales', async () => {
      await crearUsuario('ana@vozmuni.test');
      await login('ana@vozmuni.test', 'Incorrecta-1');
      await login('ana@vozmuni.test');

      const todos = await registros();
      expect(todos).toHaveLength(2);
      expect(JSON.stringify(todos)).not.toContain('Incorrecta-1');
      expect(JSON.stringify(todos)).not.toContain(PASSWORD);
      expect(todos.every((r) => r.dependencia_id === null)).toBe(true);
    });
  });

  describe('contraseñas, registro y verificación (SPEC 09, 10, 13 y 16)', () => {
    const tokenDelCorreo = (patron: RegExp) => patron.exec(enviador.enviados.at(-1)!.texto)![1];

    it('pedir la recuperación de una cuenta existente deja password.solicitar; de una inexistente nada, con la misma respuesta', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const existente = await request(app).post('/api/v1/auth/recuperar').send({ email: 'ana@vozmuni.test' });
      const inexistente = await request(app).post('/api/v1/auth/recuperar').send({ email: 'nadie@vozmuni.test' });

      expect(inexistente.status).toBe(existente.status);
      expect(inexistente.body).toEqual(existente.body);
      expect(await registros()).toEqual([
        expect.objectContaining({ accion: 'password.solicitar', entidad_id: String(id), usuario_id: String(id), dependencia_id: null }),
      ]);
    });

    it('restablecer con un enlace de recuperación deja password.definir con tipo recuperacion, sin sesion.iniciar', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      await request(app).post('/api/v1/auth/recuperar').send({ email: 'ana@vozmuni.test' });
      const token = tokenDelCorreo(/restablecer\?token=([A-Za-z0-9_-]+)/);

      const res = await request(app).post('/api/v1/auth/restablecer').send({ token, password: NUEVA });

      expect(res.status).toBe(200);
      expect(await acciones()).toEqual(['password.solicitar', 'password.definir']);
      const definir = (await registros())[1];
      expect(definir).toMatchObject({ usuario_id: String(id), detalle: { datos: { tipo: 'recuperacion' } } });
      expect(JSON.stringify(definir)).not.toContain(NUEVA);
    });

    it('aceptar una invitación deja password.definir con tipo invitacion', async () => {
      const id = await crearUsuario('nuevo@vozmuni.test', { password_hash: null });
      const token = 'token-de-invitacion-de-prueba';
      await db('restablecimientos').insert({
        usuario_id: id,
        token_hash: createHash('sha256').update(token).digest('hex'),
        tipo: 'invitacion',
        expira_en: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect((await request(app).post('/api/v1/auth/restablecer').send({ token, password: NUEVA })).status).toBe(200);
      expect(await registros()).toEqual([
        expect.objectContaining({ accion: 'password.definir', usuario_id: String(id), detalle: { datos: { tipo: 'invitacion' } } }),
      ]);
    });

    it('registrar un vecino nuevo deja usuario.registrar enmascarado; verificar deja usuario.verificar_correo', async () => {
      const cuerpo = { nombre: 'Rosa Vecina', dpi: '1234567890101', email: 'rosa@correo.gt', telefono: '55550000', password: NUEVA };
      expect((await request(app).post('/api/v1/auth/registro').send(cuerpo)).status).toBe(202);

      const { id } = await db('usuarios').where({ email: 'rosa@correo.gt' }).first('id');
      const [registro] = await registros();
      expect(registro).toMatchObject({ accion: 'usuario.registrar', entidad_id: String(id), usuario_id: String(id), dependencia_id: null });
      expect(registro.detalle.cambios).toEqual({
        nombre: { antes: null, despues: 'Rosa Vecina' },
        dpi: { antes: null, despues: '*********0101' },
        email: { antes: null, despues: 'r***@correo.gt' },
        telefono: { antes: null, despues: '****0000' },
      });
      expect(JSON.stringify(registro)).not.toContain(NUEVA);

      // Un segundo registro con el mismo correo ya verificado no deja nada.
      const token = tokenDelCorreo(/verificar\?token=([A-Za-z0-9_-]+)/);
      expect((await request(app).post('/api/v1/auth/verificar').send({ token })).status).toBe(200);
      expect((await registros()).at(-1)).toMatchObject({ accion: 'usuario.verificar_correo', usuario_id: String(id) });

      expect((await request(app).post('/api/v1/auth/registro').send(cuerpo)).status).toBe(202);
      expect(await acciones()).toEqual(['usuario.registrar', 'usuario.verificar_correo']);
    });
  });
});
