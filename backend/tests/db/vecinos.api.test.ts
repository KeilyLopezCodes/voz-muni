import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const NUEVA = 'Clave-vecino-2026';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallar = false;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallar) {
      throw new Error('ECONNREFUSED smtp');
    }
    this.enviados.push(mensaje);
  }
}

async function esperarCorreos(enviador: EnviadorEnMemoria, cantidad: number): Promise<MensajeCorreo[]> {
  for (let intento = 0; intento < 100 && enviador.enviados.length < cantidad; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  return enviador.enviados;
}

const tokenDe = (correo: MensajeCorreo) => /restablecer\?token=([A-Za-z0-9_-]+)/.exec(correo.texto)![1];

describe('API de alta de vecino en ventanilla POST /api/v1/vecinos', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [dependencia] = await db('dependencias').insert({ nombre: 'Obras' }).returning('id');
    const [categoria] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: dependencia.id }).returning('id');
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.categoria = Number(categoria.id);
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: [string, number | null][] = [
      ['receptor', null],
      ['supervisor', null],
      ['vecino', null],
      ['tecnico', Number(dependencia.id)],
      ['coordinador', Number(dependencia.id)],
      ['administrador', null],
    ];
    for (const [rol, dependenciaId] of roles) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      await db('usuarios').insert({
        nombre: `Usuario ${rol}`,
        email: `${rol}@ventanilla.test`,
        rol_id: rolId,
        password_hash: hash,
        dependencia_id: dependenciaId,
      });
      const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@ventanilla.test`, password: PASSWORD });
      tokens[rol] = res.body.accessToken;
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

  beforeEach(async () => {
    enviador.enviados.length = 0;
    enviador.fallar = false;
  });

  let dpiSiguiente = 2547000000001;
  const nuevoDpi = () => String(dpiSiguiente++);

  const alta = (quien: string | null, cuerpo: object) => {
    const peticion = request(app).post('/api/v1/vecinos');
    return (quien ? peticion.set('Authorization', `Bearer ${tokens[quien]}`) : peticion).send(cuerpo);
  };

  it('el receptor da de alta un vecino con correo: con la invitación define su contraseña y entra', async () => {
    const res = await alta('receptor', { nombre: '  María López ', dpi: '2547 12345 0101', email: 'Maria@Correo.GT' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      vecino: { id: expect.any(Number), nombre: 'María López', email: 'm***@correo.gt', telefono: null },
      invitacionEnviada: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('2547123450101');
    const fila = await db('usuarios as u').join('roles as r', 'r.id', 'u.rol_id').where('u.id', res.body.vecino.id).first();
    expect(fila).toMatchObject({ nombre: 'vecino', activo: true, password_hash: null, dependencia_id: null, dpi: '2547123450101' });

    const [invitacion] = await esperarCorreos(enviador, 1);
    expect(invitacion).toMatchObject({ para: 'maria@correo.gt', asunto: 'VozMuni: sigue tus quejas en el portal' });
    const vigencia = await db('restablecimientos')
      .where({ usuario_id: res.body.vecino.id })
      .first('tipo', db.raw('extract(epoch from expira_en - creado_en)::float as segundos'));
    expect(vigencia.tipo).toBe('invitacion');
    expect(Math.abs(vigencia.segundos - 24 * 60 * 60)).toBeLessThan(5);

    const restablecido = await request(app).post('/api/v1/auth/restablecer').send({ token: tokenDe(invitacion), password: NUEVA });
    expect(restablecido.status).toBe(200);
    expect(restablecido.body.usuario).toMatchObject({ rol: 'vecino' });
    await new Promise((resolver) => setTimeout(resolver, 150));
    expect(enviador.enviados).toHaveLength(1); // sin password_cambiado
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'maria@correo.gt', password: NUEVA })).status).toBe(200);
  });

  it('solo con teléfono 5555-0000: se guarda como 55550000, sin invitación, y se le registra una queja', async () => {
    const res = await alta('receptor', { nombre: 'Pedro Pérez', dpi: nuevoDpi(), telefono: '5555-0000' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      vecino: { id: expect.any(Number), nombre: 'Pedro Pérez', email: null, telefono: '****0000' },
      invitacionEnviada: false,
    });
    expect(await db('usuarios').where({ id: res.body.vecino.id }).first('telefono')).toEqual({ telefono: '55550000' });
    expect(await db('restablecimientos').where({ usuario_id: res.body.vecino.id })).toEqual([]);

    const queja = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.receptor}`)
      .send({
        categoriaId: ids.categoria,
        zonaId: ids.zona,
        titulo: 'Fuga de agua en la esquina',
        descripcion: 'Sale agua de la tubería desde ayer',
        direccion: '3a calle 4-10, zona 1',
        solicitanteId: res.body.vecino.id,
        canal: 'telefono',
      });
    expect(queja.status).toBe(201);
  });

  it('el supervisor también da de alta', async () => {
    expect((await alta('supervisor', { nombre: 'Ana Ruiz', dpi: nuevoDpi(), telefono: '44441111' })).status).toBe(201);
  });

  it.each(['vecino', 'tecnico', 'coordinador', 'administrador'])('el %s recibe 403', async (quien) => {
    const res = await alta(quien, { nombre: 'X', dpi: nuevoDpi(), telefono: '44442222' });

    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('PERMISO_DENEGADO');
  });

  it('sin token responde 401', async () => {
    expect((await alta(null, { nombre: 'X', dpi: nuevoDpi(), telefono: '44442222' })).status).toBe(401);
  });

  it('un correo o un DPI repetidos responden 409 sin datos del existente; el mismo teléfono se permite', async () => {
    const dpi = nuevoDpi();
    await alta('receptor', { nombre: 'Luis', dpi, email: 'luis@correo.gt', telefono: '33330000' });

    const correo = await alta('receptor', { nombre: 'Otro', dpi: nuevoDpi(), email: 'LUIS@correo.gt' });
    expect(correo.status).toBe(409);
    expect(correo.body).toEqual({ codigo: 'EMAIL_DUPLICADO', mensaje: expect.any(String) });
    expect(JSON.stringify(correo.body)).not.toMatch(/luis|"id"/i);

    const documento = await alta('receptor', { nombre: 'Otro', dpi, telefono: '33339999' });
    expect(documento.status).toBe(409);
    expect(documento.body.codigo).toBe('DPI_DUPLICADO');

    // El correo de un usuario interno también es duplicado.
    expect((await alta('receptor', { nombre: 'Otro', dpi: nuevoDpi(), email: 'tecnico@ventanilla.test' })).status).toBe(409);

    expect((await alta('receptor', { nombre: 'Familiar', dpi: nuevoDpi(), telefono: '3333-0000' })).status).toBe(201);
  });

  it.each([
    ['rol', { rol: 'administrador' }, 'VALIDACION'],
    ['password', { password: 'Clave1234' }, 'VALIDACION'],
    ['activo', { activo: false }, 'VALIDACION'],
    ['sin correo ni teléfono', { telefono: undefined }, 'CONTACTO_REQUERIDO'],
    ['teléfono de 7 dígitos', { telefono: '5555000' }, 'TELEFONO_INVALIDO'],
    ['DPI de 12 dígitos', { dpi: '254712345010' }, 'DPI_INVALIDO'],
    ['nombre en blanco', { nombre: '   ' }, 'NOMBRE_INVALIDO'],
    ['correo inválido', { email: 'sin-arroba' }, 'EMAIL_INVALIDO'],
  ])('%s → 400 %s', async (_caso, cambios, codigo) => {
    const res = await alta('receptor', { nombre: 'Rosa', dpi: nuevoDpi(), telefono: '22220000', ...cambios });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
  });

  it('si falla el envío de la invitación responde 201 con invitacionEnviada: false y el vecino existe', async () => {
    enviador.fallar = true;
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await alta('receptor', { nombre: 'Carla', dpi: nuevoDpi(), email: 'carla@correo.gt' });

      expect(res.status).toBe(201);
      expect(res.body.invitacionEnviada).toBe(false);
      expect(await db('usuarios').where({ email: 'carla@correo.gt' }).first('id')).toBeDefined();
      expect(consola).toHaveBeenCalledWith(expect.stringContaining('invitacion_vecino'));
    } finally {
      consola.mockRestore();
    }
  });

  it('GET /vecinos?telefono=5555-0000 encuentra a los guardados con 55550000', async () => {
    const res = await request(app).get('/api/v1/vecinos?telefono=5555-0000').set('Authorization', `Bearer ${tokens.receptor}`);

    expect(res.status).toBe(200);
    expect(res.body.datos.map((v: { nombre: string }) => v.nombre)).toContain('Pedro Pérez');
    expect(res.body.datos.every((v: { telefono: string }) => v.telefono === '****0000')).toBe(true);
  });

  it('/auth/recuperar envía un enlace nuevo a un vecino de ventanilla con la invitación vencida', async () => {
    const res = await alta('receptor', { nombre: 'Jorge', dpi: nuevoDpi(), email: 'jorge@correo.gt' });
    await esperarCorreos(enviador, 1);
    await db('restablecimientos').where({ usuario_id: res.body.vecino.id }).update({ expira_en: db.raw("now() - interval '1 second'") });

    const recuperar = await request(app).post('/api/v1/auth/recuperar').send({ email: 'jorge@correo.gt' });
    const inexistente = await request(app).post('/api/v1/auth/recuperar').send({ email: 'nadie@correo.gt' });

    expect(recuperar.status).toBe(202);
    expect(inexistente.body).toEqual(recuperar.body);
    const correos = await esperarCorreos(enviador, 2);
    expect(correos[1]).toMatchObject({ para: 'jorge@correo.gt', asunto: 'VozMuni: restablece tu contraseña' });
    const restablecido = await request(app).post('/api/v1/auth/restablecer').send({ token: tokenDe(correos[1]), password: NUEVA });
    expect(restablecido.status).toBe(200);
  });
});
