import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-registro-1';
const MENSAJE = { mensaje: 'Revisa tu correo para continuar.' };
const ASUNTO_VERIFICACION = 'VozMuni: confirma tu correo';
const ASUNTO_CUENTA_EXISTENTE = 'VozMuni: ya tienes una cuenta';
const ASUNTO_NO_COMPLETADO = 'VozMuni: no pudimos crear tu cuenta';
const HORA = 60 * 60 * 1000;

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

// Da tiempo a que salga un correo que no debería salir.
const pausa = () => new Promise((resolver) => setTimeout(resolver, 150));

function tokenDe(correo: MensajeCorreo, ruta = 'verificar'): string {
  return new RegExp(`${ruta}\\?token=([A-Za-z0-9_-]+)`).exec(correo.texto)![1];
}

let ultimoDpi = 3000000000000;
const nuevoDpi = () => String(++ultimoDpi);

describe('API de registro /api/v1/auth/registro y /verificar', () => {
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
    await db('correos_salientes').delete(); // apunta a usuarios y tickets (SPEC 34)
    await db('usuarios').delete();
  });

  async function crearUsuario(email: string | null, rol: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
    const [fila] = await db('usuarios')
      .insert({
        nombre: 'Existente',
        email,
        dpi: nuevoDpi(),
        rol_id: rolId,
        // Costo bajo solo en los datos de prueba: bcrypt lee el costo del propio hash.
        password_hash: await bcrypt.hash('Otra-clave-1', 4),
        correo_verificado_en: new Date(),
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const datos = (cambios: Record<string, unknown> = {}) => ({
    nombre: 'María López',
    dpi: nuevoDpi(),
    email: 'maria@correo.gt',
    password: PASSWORD,
    ...cambios,
  });
  const registrar = (cuerpo: Record<string, unknown>) => request(app).post('/api/v1/auth/registro').send(cuerpo);
  const verificar = (token: string) => request(app).post('/api/v1/auth/verificar').send({ token });
  const login = (email: string, password: string) => request(app).post('/api/v1/auth/login').send({ email, password });

  it('registro nuevo → 202; login sin verificar → 403; el enlace verifica; después el login responde 200', async () => {
    const antes = Date.now();
    const res = await registrar(datos({ nombre: '  María López ', dpi: '2547 12345 0101', email: 'Maria@Correo.GT', telefono: '5555-0000' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual(MENSAJE);

    const fila = await db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where('u.email', 'maria@correo.gt')
      .first('u.id', 'u.nombre', 'u.dpi', 'u.telefono', 'u.activo', 'u.password_hash', 'u.correo_verificado_en', 'r.nombre as rol');
    expect(fila).toMatchObject({
      nombre: 'María López',
      dpi: '2547123450101',
      telefono: '55550000',
      activo: true,
      correo_verificado_en: null,
      rol: 'vecino',
    });
    expect(await bcrypt.compare(PASSWORD, fila.password_hash)).toBe(true);

    const [correo] = await esperarCorreos(enviador, 1);
    const token = tokenDe(correo);
    expect(correo).toMatchObject({ para: 'maria@correo.gt', asunto: ASUNTO_VERIFICACION });
    expect(correo.texto).toContain('Hola María López:');
    expect(correo.html).toContain(`<a href="http://localhost:5173/verificar?token=${token}">`);

    // Solo se guarda el hash, con vigencia de 24 h.
    const enlace = await db('restablecimientos').where({ usuario_id: fila.id }).first();
    expect(enlace.tipo).toBe('verificacion');
    expect(enlace.token_hash).not.toContain(token);
    expect(new Date(enlace.expira_en).getTime()).toBeGreaterThanOrEqual(antes + 24 * HORA);
    expect(new Date(enlace.expira_en).getTime()).toBeLessThanOrEqual(Date.now() + 24 * HORA);

    const sinVerificar = await login('maria@correo.gt', PASSWORD);
    expect(sinVerificar.status).toBe(403);
    expect(sinVerificar.body).toEqual({ codigo: 'CORREO_NO_VERIFICADO', mensaje: expect.any(String) });
    expect(await db('sesiones')).toEqual([]);
    // Con la contraseña incorrecta no se revela el estado de la cuenta.
    expect((await login('maria@correo.gt', 'Incorrecta-1')).status).toBe(401);

    const verificado = await verificar(token);
    expect(verificado.status).toBe(200);
    expect(verificado.body).toEqual({ mensaje: 'Correo verificado. Ya puedes iniciar sesión.' });
    expect((await db('usuarios').where({ id: fila.id }).first('correo_verificado_en')).correo_verificado_en).not.toBeNull();

    const conSesion = await login('maria@correo.gt', PASSWORD);
    expect(conSesion.status).toBe(200);
    expect(conSesion.body.usuario).toMatchObject({ nombre: 'María López', rol: 'vecino', dependenciaId: null });
  });

  it('los 5 casos responden igual y cada uno envía su correo (el inactivo, ninguno)', async () => {
    await crearUsuario('verificada@correo.gt', 'vecino');
    await crearUsuario('interno@correo.gt', 'receptor');
    await crearUsuario('inactivo@correo.gt', 'vecino', { activo: false });
    const dpiAjeno = nuevoDpi();
    await crearUsuario('dueno-dpi@correo.gt', 'vecino', { dpi: dpiAjeno });
    await registrar(datos({ email: 'pendiente@correo.gt' }));
    await esperarCorreos(enviador, 1);
    enviador.enviados.length = 0;

    const respuestas = [
      await registrar(datos({ email: 'nueva@correo.gt' })), // 1
      await registrar(datos({ email: 'pendiente@correo.gt', nombre: 'Pendiente Otra Vez' })), // 2
      await registrar(datos({ email: 'verificada@correo.gt' })), // 3: cuenta verificada
      await registrar(datos({ email: 'interno@correo.gt' })), // 3: usuario interno
      await registrar(datos({ email: 'otra@correo.gt', dpi: dpiAjeno })), // 4
      await registrar(datos({ email: 'inactivo@correo.gt' })), // 5
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual(MENSAJE);
    }
    await esperarCorreos(enviador, 5);
    await pausa();
    expect(enviador.enviados.map(({ para, asunto }) => ({ para, asunto })).sort((a, b) => a.para.localeCompare(b.para))).toEqual([
      { para: 'interno@correo.gt', asunto: ASUNTO_CUENTA_EXISTENTE },
      { para: 'nueva@correo.gt', asunto: ASUNTO_VERIFICACION },
      { para: 'otra@correo.gt', asunto: ASUNTO_NO_COMPLETADO },
      { para: 'pendiente@correo.gt', asunto: ASUNTO_VERIFICACION },
      { para: 'verificada@correo.gt', asunto: ASUNTO_CUENTA_EXISTENTE },
    ]);
    // El caso 4 no crea nada.
    expect(await db('usuarios').where({ email: 'otra@correo.gt' })).toEqual([]);
  });

  it('registrar de nuevo un correo pendiente reemplaza nombre y contraseña, y solo sirve el enlace nuevo', async () => {
    await registrar(datos({ nombre: 'Primer Nombre' }));
    const anterior = tokenDe((await esperarCorreos(enviador, 1))[0]);

    await registrar(datos({ nombre: 'Segundo Nombre', password: 'Clave-nueva-22' }));
    const nuevo = tokenDe((await esperarCorreos(enviador, 2))[1]);

    expect(await db('usuarios').where({ email: 'maria@correo.gt' }).select('nombre')).toEqual([{ nombre: 'Segundo Nombre' }]);
    expect((await verificar(anterior)).body).toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    expect((await verificar(nuevo)).status).toBe(200);
    expect((await login('maria@correo.gt', PASSWORD)).status).toBe(401);
    expect((await login('maria@correo.gt', 'Clave-nueva-22')).status).toBe(200);
  });

  it('un vecino de ventanilla (SPEC 13) que se registra con su correo recibe cuenta_existente y su cuenta no cambia', async () => {
    const id = await crearUsuario('ventanilla@correo.gt', 'vecino', { password_hash: null, correo_verificado_en: null });
    const antes = await db('usuarios').where({ id }).first();

    expect((await registrar(datos({ email: 'ventanilla@correo.gt', nombre: 'Intruso' }))).status).toBe(202);
    const [correo] = await esperarCorreos(enviador, 1);

    expect(correo).toMatchObject({ para: 'ventanilla@correo.gt', asunto: ASUNTO_CUENTA_EXISTENTE });
    expect(await db('usuarios').where({ id }).first()).toEqual(antes);
    expect(await db('restablecimientos')).toEqual([]);
  });

  it.each([
    ['un DPI de 12 dígitos', { dpi: '254712345010' }, 'DPI_INVALIDO'],
    ['un correo inválido', { email: 'no-es-correo' }, 'EMAIL_INVALIDO'],
    ['un teléfono de 7 dígitos', { telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    ['un nombre vacío', { nombre: '   ' }, 'NOMBRE_INVALIDO'],
    ['la contraseña abcdefgh', { password: 'abcdefgh' }, 'POLITICA_PASSWORD'],
    ['un rol en el cuerpo', { rol: 'administrador' }, 'VALIDACION'],
    ['sin contraseña', { password: undefined }, 'VALIDACION'],
  ])('%s responde 400 %s y no crea nada', async (_caso, cambios, codigo) => {
    const res = await registrar(datos(cambios));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ codigo });
    expect(await db('usuarios')).toEqual([]);
  });

  it('reusar un token de verificación responde 400 TOKEN_VERIFICACION_INVALIDO', async () => {
    await registrar(datos());
    const token = tokenDe((await esperarCorreos(enviador, 1))[0]);

    expect((await verificar(token)).status).toBe(200);
    const reuso = await verificar(token);
    expect(reuso.status).toBe(400);
    expect(reuso.body).toEqual({ codigo: 'TOKEN_VERIFICACION_INVALIDO', mensaje: expect.any(String) });
  });

  it('un token de recuperación no sirve en /verificar, y uno inexistente tampoco', async () => {
    await crearUsuario('ana@correo.gt', 'vecino');
    await request(app).post('/api/v1/auth/recuperar').send({ email: 'ana@correo.gt' });
    const token = tokenDe((await esperarCorreos(enviador, 1))[0], 'restablecer');

    for (const candidato of [token, 'no-existe']) {
      const res = await verificar(candidato);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ codigo: 'TOKEN_VERIFICACION_INVALIDO' });
    }
    expect((await db('restablecimientos').first('usado_en')).usado_en).toBeNull();
  });

  it('/verificar rechaza un cuerpo sin token o con campos extra', async () => {
    expect((await request(app).post('/api/v1/auth/verificar').send({})).body).toMatchObject({ codigo: 'VALIDACION' });
    expect((await request(app).post('/api/v1/auth/verificar').send({ token: 'x', otro: 1 })).body).toMatchObject({
      codigo: 'VALIDACION',
    });
  });
});
