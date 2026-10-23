import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-vecino-1';
const MENSAJE = { mensaje: 'Revisa tu correo para continuar.' };

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

async function esperarCorreos(enviador: EnviadorEnMemoria, cantidad: number): Promise<MensajeCorreo[]> {
  for (let intento = 0; intento < 100 && enviador.enviados.length < cantidad; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  return enviador.enviados;
}

const tokenDe = (correo: MensajeCorreo, ruta = 'verificar') =>
  new RegExp(`${ruta}\\?token=([A-Za-z0-9_-]+)`).exec(correo.texto)![1];

describe('Registro de vecino y verificación de correo (SPEC 16)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
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
    await db('sesiones').delete();
    await db('restablecimientos').delete();
    await db('usuarios').delete();
  });

  let dpi = 2547000000001;
  const nuevoDpi = () => String(dpi++);
  const datos = (cambios: object = {}) => ({
    nombre: 'Ana López',
    dpi: nuevoDpi(),
    email: 'ana@correo.gt',
    password: PASSWORD,
    ...cambios,
  });

  const registrar = (cuerpo: object) => request(app).post('/api/v1/auth/registro').send(cuerpo);
  const verificar = (token: string) => request(app).post('/api/v1/auth/verificar').send({ token });
  const login = (email: string, password = PASSWORD) => request(app).post('/api/v1/auth/login').send({ email, password });

  async function crearUsuario(email: string | null, rol: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
    const [fila] = await db('usuarios')
      .insert({ nombre: `Usuario ${rol}`, email, telefono: '55550000', rol_id: rolId, ...cambios })
      .returning('id');
    return Number(fila.id);
  }

  it('registro nuevo: 202, login 403 antes de verificar, verificar 200 y luego el login funciona', async () => {
    const res = await registrar(datos({ email: 'Ana@Correo.GT', telefono: '5555-0000' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual(MENSAJE);

    const fila = await db('usuarios as u').join('roles as r', 'r.id', 'u.rol_id').where('u.email', 'ana@correo.gt').first();
    expect(fila).toMatchObject({ nombre: 'vecino', activo: true, correo_verificado_en: null, telefono: '55550000' });
    expect(fila.password_hash).toMatch(/^\$2[aby]\$12\$/);

    const antes = await login('ana@correo.gt');
    expect(antes.status).toBe(403);
    expect(antes.body.codigo).toBe('CORREO_NO_VERIFICADO');
    expect(antes.body.accessToken).toBeUndefined();
    expect((await login('ana@correo.gt', 'Otra-clave-1')).status).toBe(401);

    const [correo] = await esperarCorreos(enviador, 1);
    expect(correo).toMatchObject({ para: 'ana@correo.gt', asunto: 'VozMuni: confirma tu correo' });
    expect(correo.texto).toContain('http://localhost:5173/verificar?token=');
    const vigencia = await db('restablecimientos').first('tipo', db.raw('extract(epoch from expira_en - creado_en)::float as segundos'));
    expect(vigencia.tipo).toBe('verificacion');
    expect(Math.abs(vigencia.segundos - 24 * 60 * 60)).toBeLessThan(5);

    const verificado = await verificar(tokenDe(correo));
    expect(verificado.status).toBe(200);
    expect(verificado.body).toEqual({ mensaje: 'Correo verificado. Ya puedes iniciar sesión.' });

    expect((await login('ana@correo.gt')).status).toBe(200);
  });

  it('las respuestas de los 5 casos son idénticas y cada caso envía su correo', async () => {
    // Caso 3: cuenta verificada. Caso 4: DPI de otro. Caso 5: usuario inactivo.
    const hash = await bcrypt.hash(PASSWORD, 4);
    await crearUsuario('verificada@correo.gt', 'vecino', { password_hash: hash, correo_verificado_en: new Date() });
    const dpiAjeno = nuevoDpi();
    await crearUsuario('duena-dpi@correo.gt', 'vecino', { dpi: dpiAjeno, password_hash: hash, correo_verificado_en: new Date() });
    await crearUsuario('inactiva@correo.gt', 'vecino', { password_hash: hash, activo: false });
    // Caso 2: registro pendiente creado por el propio registro.
    await registrar(datos({ email: 'pendiente@correo.gt' }));
    await esperarCorreos(enviador, 1);
    enviador.enviados.length = 0;

    const casos: [string, object, string | null][] = [
      ['1', datos({ email: 'nueva@correo.gt' }), 'VozMuni: confirma tu correo'],
      ['2', datos({ email: 'pendiente@correo.gt' }), 'VozMuni: confirma tu correo'],
      ['3', datos({ email: 'verificada@correo.gt' }), 'VozMuni: ya tienes una cuenta'],
      ['4', datos({ email: 'otra@correo.gt', dpi: dpiAjeno }), 'VozMuni: no pudimos crear tu cuenta'],
      ['5', datos({ email: 'inactiva@correo.gt' }), null],
    ];
    const respuestas = [];
    for (const [, cuerpo] of casos) {
      respuestas.push(await registrar(cuerpo));
    }
    for (const res of respuestas) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual(MENSAJE);
    }

    await esperarCorreos(enviador, 4);
    await new Promise((resolver) => setTimeout(resolver, 150));
    const recibidos = enviador.enviados.map((c) => [c.para, c.asunto]).sort();
    expect(recibidos).toEqual(
      [
        ['nueva@correo.gt', 'VozMuni: confirma tu correo'],
        ['pendiente@correo.gt', 'VozMuni: confirma tu correo'],
        ['verificada@correo.gt', 'VozMuni: ya tienes una cuenta'],
        ['otra@correo.gt', 'VozMuni: no pudimos crear tu cuenta'],
      ].sort(),
    );
    expect(await db('usuarios').where({ email: 'otra@correo.gt' }).first()).toBeUndefined();
  });

  it('registrar de nuevo un correo pendiente reemplaza nombre y contraseña, y el enlace anterior deja de servir', async () => {
    await registrar(datos({ nombre: 'Primer nombre' }));
    const [primero] = await esperarCorreos(enviador, 1);

    await registrar(datos({ nombre: 'Segundo nombre', password: 'Otra-clave-2' }));
    const [, segundo] = await esperarCorreos(enviador, 2);

    expect((await db('usuarios').where({ email: 'ana@correo.gt' }).first('nombre')).nombre).toBe('Segundo nombre');
    expect(await db('usuarios').where({ email: 'ana@correo.gt' }).count({ total: '*' })).toEqual([{ total: '1' }]);
    expect((await verificar(tokenDe(primero))).status).toBe(400);
    expect((await verificar(tokenDe(segundo))).status).toBe(200);
    expect((await login('ana@correo.gt', 'Otra-clave-2')).status).toBe(200);
    expect((await login('ana@correo.gt')).status).toBe(401);
  });

  it('un vecino de ventanilla con correo recibe cuenta_existente y su cuenta no cambia', async () => {
    const id = await crearUsuario('ventanilla@correo.gt', 'vecino');
    const antes = await db('usuarios').where({ id }).first();

    expect((await registrar(datos({ email: 'ventanilla@correo.gt' }))).status).toBe(202);
    const [correo] = await esperarCorreos(enviador, 1);

    expect(correo).toMatchObject({ para: 'ventanilla@correo.gt', asunto: 'VozMuni: ya tienes una cuenta' });
    expect(await db('usuarios').where({ id }).first()).toEqual(antes);
  });

  it.each([
    ['un DPI de 12 dígitos', { dpi: '254712345010' }, 'DPI_INVALIDO'],
    ['una contraseña abcdefgh', { password: 'abcdefgh' }, 'POLITICA_PASSWORD'],
    ['un correo inválido', { email: 'sin-arroba' }, 'EMAIL_INVALIDO'],
    ['un teléfono de 7 dígitos', { telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    ['un rol en el cuerpo', { rol: 'administrador' }, 'VALIDACION'],
  ])('%s → 400 %s', async (_caso, cambios, codigo) => {
    const res = await registrar(datos(cambios));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
    expect(await db('usuarios').count({ total: '*' })).toEqual([{ total: '0' }]);
  });

  it('reusar un token de verificación → 400 TOKEN_VERIFICACION_INVALIDO', async () => {
    await registrar(datos());
    const [correo] = await esperarCorreos(enviador, 1);
    expect((await verificar(tokenDe(correo))).status).toBe(200);

    const res = await verificar(tokenDe(correo));
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('TOKEN_VERIFICACION_INVALIDO');
  });

  it('un token de recuperación no sirve en /verificar, y uno de verificación no sirve en /restablecer', async () => {
    await registrar(datos());
    const [verificacion] = await esperarCorreos(enviador, 1);
    await request(app).post('/api/v1/auth/recuperar').send({ email: 'ana@correo.gt' });
    const [, recuperacion] = await esperarCorreos(enviador, 2);

    expect((await verificar(tokenDe(recuperacion, 'restablecer'))).body.codigo).toBe('TOKEN_VERIFICACION_INVALIDO');
    const restablecer = await request(app)
      .post('/api/v1/auth/restablecer')
      .send({ token: tokenDe(verificacion), password: 'Nueva-clave-3' });
    expect(restablecer.body.codigo).toBe('TOKEN_RECUPERACION_INVALIDO');
  });

  it('restablecer con un enlace de recuperación verifica el correo', async () => {
    await registrar(datos());
    await esperarCorreos(enviador, 1);
    await request(app).post('/api/v1/auth/recuperar').send({ email: 'ana@correo.gt' });
    const [, recuperacion] = await esperarCorreos(enviador, 2);

    const res = await request(app)
      .post('/api/v1/auth/restablecer')
      .send({ token: tokenDe(recuperacion, 'restablecer'), password: 'Nueva-clave-3' });

    expect(res.status).toBe(200);
    expect((await db('usuarios').where({ email: 'ana@correo.gt' }).first('correo_verificado_en')).correo_verificado_en).not.toBeNull();
    expect((await login('ana@correo.gt', 'Nueva-clave-3')).status).toBe(200);
  });
});
