import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-anterior-1';
const NUEVA = 'Clave-nueva-2026';
const MENSAJE = { mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

// El correo sale después de responder: espera a que llegue la cantidad indicada.
async function esperarCorreos(enviador: EnviadorEnMemoria, cantidad: number): Promise<MensajeCorreo[]> {
  for (let intento = 0; intento < 100 && enviador.enviados.length < cantidad; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  return enviador.enviados;
}

function tokenDe(correo: MensajeCorreo): string {
  return /restablecer\?token=([A-Za-z0-9_-]+)/.exec(correo.texto)![1];
}

describe('API de recuperación /api/v1/auth/recuperar y /restablecer', () => {
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
    // Costo bajo solo en los datos de prueba: bcrypt lee el costo del propio hash.
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  // No deja usuarios: así las demás suites pueden revertir 0006_roles.
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
    await db('sesiones').delete();
    await db('restablecimientos').delete();
    await db('usuarios').delete();
  });

  async function crearUsuario(email: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: 'vecino' }).first('id');
    const [fila] = await db('usuarios')
      .insert({ nombre: 'Ana Vecina', email, rol_id: rolId, password_hash: passwordHash, ...cambios })
      .returning('id');
    return Number(fila.id);
  }

  const recuperar = (email: string) => request(app).post('/api/v1/auth/recuperar').send({ email });
  const restablecer = (token: string, password: string = NUEVA) =>
    request(app).post('/api/v1/auth/restablecer').send({ token, password });
  const login = (email: string, password: string) =>
    request(app).post('/api/v1/auth/login').send({ email, password });

  // Pide el enlace y devuelve el token que viaja en el correo.
  async function pedirToken(email = 'ana@vozmuni.test'): Promise<string> {
    const antes = enviador.enviados.length;
    await recuperar(email);
    return tokenDe((await esperarCorreos(enviador, antes + 1))[antes]);
  }

  describe('POST /recuperar', () => {
    it('responde 202 con el mismo cuerpo en todos los casos y solo envía a usuarios activos (SPEC 13)', async () => {
      await crearUsuario('ana@vozmuni.test');
      await crearUsuario('inactivo@vozmuni.test', { activo: false });
      await crearUsuario('sinclave@vozmuni.test', { password_hash: null });

      for (const email of ['ana@vozmuni.test', 'nadie@vozmuni.test', 'inactivo@vozmuni.test', 'sinclave@vozmuni.test']) {
        const res = await recuperar(email);
        expect(res.status).toBe(202);
        expect(res.body).toEqual(MENSAJE);
      }

      await esperarCorreos(enviador, 1);
      await new Promise((resolver) => setTimeout(resolver, 100));
      // Desde SPEC 13 el vecino sin contraseña también recibe el enlace; el inactivo y el inexistente no.
      await esperarCorreos(enviador, 2);
      expect(enviador.enviados.map((correo) => correo.para).sort()).toEqual(['ana@vozmuni.test', 'sinclave@vozmuni.test']);
    });

    it('envía la plantilla de la base con el nombre y el enlace, y guarda solo el hash del token', async () => {
      await crearUsuario('ana@vozmuni.test');

      await recuperar('ANA@VozMuni.test');
      const [correo] = await esperarCorreos(enviador, 1);
      const token = tokenDe(correo);

      expect(correo.asunto).toBe('VozMuni: restablece tu contraseña');
      expect(correo.texto).toContain('Hola Ana Vecina:');
      expect(correo.texto).toContain(`http://localhost:5173/restablecer?token=${token}`);
      expect(correo.html).toContain(`<a href="http://localhost:5173/restablecer?token=${token}">`);

      const filas: { token_hash: string }[] = await db('restablecimientos').select('token_hash');
      expect(filas).toHaveLength(1);
      expect(filas[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(filas[0].token_hash).not.toContain(token);
    });

    it('un cambio del asunto en la base se usa en el siguiente correo sin reiniciar', async () => {
      await crearUsuario('ana@vozmuni.test');
      const { asunto } = await db('plantillas_notificacion').where({ clave: 'recuperacion_password' }).first('asunto');
      try {
        await db('plantillas_notificacion').where({ clave: 'recuperacion_password' }).update({ asunto: 'Asunto editado' });

        await recuperar('ana@vozmuni.test');
        const [correo] = await esperarCorreos(enviador, 1);

        expect(correo.asunto).toBe('Asunto editado');
      } finally {
        await db('plantillas_notificacion').where({ clave: 'recuperacion_password' }).update({ asunto });
      }
    });

    it('pedir dos veces deja vigente solo el segundo enlace', async () => {
      await crearUsuario('ana@vozmuni.test');
      const primero = await pedirToken();
      const segundo = await pedirToken();

      const res = await restablecer(primero);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'TOKEN_RECUPERACION_INVALIDO', mensaje: expect.any(String) });
      expect((await restablecer(segundo)).status).toBe(200);
    });

    it('un cuerpo inválido responde 400 VALIDACION', async () => {
      const res = await recuperar('no-es-correo');

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });

    it('con RECUPERACION_LIMITE_POR_VENTANA=2 la 3.ª solicitud responde 429', async () => {
      const limitado = buildContainer(envDePrueba({ RECUPERACION_LIMITE_POR_VENTANA: 2 }), {
        enviadorCorreo: new EnviadorEnMemoria(),
      });
      try {
        const appLimitada = createApp(limitado);
        const pedir = () => request(appLimitada).post('/api/v1/auth/recuperar').send({ email: 'nadie@vozmuni.test' });

        expect((await pedir()).status).toBe(202);
        expect((await pedir()).status).toBe(202);
        const tercera = await pedir();
        expect(tercera.status).toBe(429);
        expect(tercera.body).toEqual({ codigo: 'DEMASIADAS_PETICIONES', mensaje: expect.any(String) });
      } finally {
        await limitado.dispose();
      }
    });
  });

  describe('POST /restablecer', () => {
    it('restablece, inicia sesión, revoca las sesiones previas y envía el aviso', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      const { body: previa } = await login('ana@vozmuni.test', PASSWORD);
      const token = await pedirToken();

      const res = await restablecer(token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        accessExpiraEn: expect.any(String),
        refreshToken: expect.any(String),
        refreshExpiraEn: expect.any(String),
        usuario: { id, nombre: 'Ana Vecina', rol: 'vecino', dependenciaId: null },
      });
      // La nueva primero: reusar la previa, ya revocada, cierra todas las sesiones (SPEC 08).
      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken })).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: previa.refreshToken })).status).toBe(401);
      expect((await login('ana@vozmuni.test', NUEVA)).status).toBe(200);
      expect((await login('ana@vozmuni.test', PASSWORD)).status).toBe(401);

      const correos = await esperarCorreos(enviador, 2);
      expect(correos[1]).toMatchObject({ para: 'ana@vozmuni.test', asunto: 'VozMuni: tu contraseña fue cambiada' });
    });

    it('reusar el token responde 400 TOKEN_RECUPERACION_INVALIDO', async () => {
      await crearUsuario('ana@vozmuni.test');
      const token = await pedirToken();
      expect((await restablecer(token)).status).toBe(200);

      const res = await restablecer(token, 'Otra-clave-3');

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('TOKEN_RECUPERACION_INVALIDO');
    });

    it('un token con expira_en en el pasado responde 400', async () => {
      await crearUsuario('ana@vozmuni.test');
      const token = await pedirToken();
      await db('restablecimientos').update({ expira_en: new Date(Date.now() - 1000) });

      const res = await restablecer(token);

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('TOKEN_RECUPERACION_INVALIDO');
    });

    it.each(['Abc1234', '12345678', 'abcdefgh'])(
      'la contraseña débil %s responde 400 POLITICA_PASSWORD y el token sigue vigente',
      async (debil) => {
        await crearUsuario('ana@vozmuni.test');
        const token = await pedirToken();

        const res = await restablecer(token, debil);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ codigo: 'POLITICA_PASSWORD', mensaje: expect.any(String) });
        expect((await restablecer(token)).status).toBe(200);
      },
    );

    it('un usuario bloqueado entra de inmediato después de restablecer', async () => {
      const id = await crearUsuario('ana@vozmuni.test');
      for (let i = 0; i < 5; i++) {
        await login('ana@vozmuni.test', 'incorrecta');
      }
      expect((await login('ana@vozmuni.test', PASSWORD)).status).toBe(423);
      const token = await pedirToken();

      expect((await restablecer(token)).status).toBe(200);

      expect(await db('usuarios').where({ id }).first('intentos_fallidos', 'bloqueado_hasta')).toEqual({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      });
      expect((await login('ana@vozmuni.test', NUEVA)).status).toBe(200);
    });
  });
});
