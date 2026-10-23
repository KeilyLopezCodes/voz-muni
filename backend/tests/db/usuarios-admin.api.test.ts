import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const NUEVA = 'Clave-nueva-2026';
const BASE = '/api/v1/admin/usuarios';

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

// Algunos correos salen después de responder: espera a que llegue la cantidad indicada.
async function esperarCorreos(enviador: EnviadorEnMemoria, cantidad: number): Promise<MensajeCorreo[]> {
  for (let intento = 0; intento < 100 && enviador.enviados.length < cantidad; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  return enviador.enviados;
}

function tokenDe(correo: MensajeCorreo): string {
  return /restablecer\?token=([A-Za-z0-9_-]+)/.exec(correo.texto)![1];
}

describe('API de administración de usuarios /api/v1/admin/usuarios', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  let passwordHash: string;
  let obras: number;
  let agua: number;
  let inactiva: number;
  let adminId: number;
  let adminToken: string;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    // Costo bajo solo en los datos de prueba: bcrypt lee el costo del propio hash.
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    const dependencias = await db('dependencias')
      .insert([
        { nombre: 'Obras', activa: true },
        { nombre: 'Agua', activa: true },
        { nombre: 'Cerrada', activa: false },
      ])
      .returning('id');
    [obras, agua, inactiva] = dependencias.map((fila: { id: string }) => Number(fila.id));
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
    enviador.fallar = false;
    await db('sesiones').delete();
    await db('restablecimientos').delete();
    await db('usuarios').delete();
    adminId = await crearUsuario('admin@vozmuni.test', 'administrador', { nombre: 'Admin Uno' });
    adminToken = await tokenDeAcceso('admin@vozmuni.test');
  });

  async function crearUsuario(email: string, rol: string, cambios: Record<string, unknown> = {}): Promise<number> {
    const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
    const [fila] = await db('usuarios')
      .insert({ nombre: email.split('@')[0], email, rol_id: rolId, password_hash: passwordHash, ...cambios })
      .returning('id');
    return Number(fila.id);
  }

  async function login(email: string, password = PASSWORD) {
    return request(app).post('/api/v1/auth/login').send({ email, password });
  }

  async function tokenDeAcceso(email: string, password = PASSWORD): Promise<string> {
    const res = await login(email, password);
    expect(res.status).toBe(200);
    return res.body.accessToken;
  }

  const comoAdmin = {
    get: (ruta: string, token = () => adminToken) => request(app).get(ruta).set('Authorization', `Bearer ${token()}`),
    post: (ruta: string, cuerpo: object = {}, token = () => adminToken) =>
      request(app).post(ruta).set('Authorization', `Bearer ${token()}`).send(cuerpo),
    patch: (ruta: string, cuerpo: object, token = () => adminToken) =>
      request(app).patch(ruta).set('Authorization', `Bearer ${token()}`).send(cuerpo),
  };

  const altaTecnico = () => ({
    nombre: 'Tomás Técnico',
    email: 'tomas@vozmuni.test',
    dpi: '2547 12345 0101',
    rol: 'tecnico',
    dependenciaId: obras,
  });

  describe('autorización', () => {
    it('sin token responde 401 y con un rol distinto de administrador 403', async () => {
      await crearUsuario('super@vozmuni.test', 'supervisor');
      const supervisor = await tokenDeAcceso('super@vozmuni.test');
      const rutas: [string, string][] = [
        ['get', BASE],
        ['get', `${BASE}/1`],
        ['post', BASE],
        ['patch', `${BASE}/1`],
        ['post', `${BASE}/1/desactivacion`],
        ['post', `${BASE}/1/activacion`],
        ['post', `${BASE}/1/desbloqueo`],
      ];

      for (const [metodo, ruta] of rutas) {
        const sinToken = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo](ruta);
        expect(sinToken.status).toBe(401);
        const conSupervisor = await (request(app) as unknown as Record<string, (r: string) => request.Test>)
          [metodo](ruta)
          .set('Authorization', `Bearer ${supervisor}`);
        expect(conSupervisor.status).toBe(403);
        expect(conSupervisor.body.codigo).toBe('PERMISO_DENEGADO');
      }
    });
  });

  describe('alta e invitación', () => {
    it('el alta responde 201, deja al técnico sin contraseña y con su enlace define la contraseña sin aviso', async () => {
      const res = await comoAdmin.post(BASE, altaTecnico());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        usuario: {
          id: expect.any(Number),
          nombre: 'Tomás Técnico',
          email: 'tomas@vozmuni.test',
          telefono: null,
          dpi: '2547123450101',
          rol: 'tecnico',
          dependenciaId: obras,
          activo: true,
          tienePassword: false,
          bloqueadoHasta: null,
        },
        invitacionEnviada: true,
      });
      const [invitacion] = enviador.enviados;
      expect(invitacion).toMatchObject({ para: 'tomas@vozmuni.test', asunto: 'VozMuni: activa tu cuenta' });
      expect(invitacion.texto).toContain('con el rol tecnico');
      const vigencia = await db('restablecimientos').first(
        'tipo',
        db.raw('extract(epoch from expira_en - creado_en)::float as segundos'),
      );
      expect(vigencia.tipo).toBe('invitacion');
      // expira_en sale de la hora de la app, tomada un instante antes de que Postgres fije creado_en.
      expect(Math.abs(vigencia.segundos - 24 * 60 * 60)).toBeLessThan(5);

      const restablecido = await request(app)
        .post('/api/v1/auth/restablecer')
        .send({ token: tokenDe(invitacion), password: NUEVA });
      expect(restablecido.status).toBe(200);
      expect(restablecido.body.usuario).toMatchObject({ rol: 'tecnico', dependenciaId: obras });
      expect((await login('tomas@vozmuni.test', NUEVA)).status).toBe(200);
      await new Promise((resolver) => setTimeout(resolver, 150));
      expect(enviador.enviados.map((correo) => correo.asunto)).toEqual(['VozMuni: activa tu cuenta']);
    });

    it('un token de invitación con más de 24 h responde 400 TOKEN_RECUPERACION_INVALIDO', async () => {
      await comoAdmin.post(BASE, altaTecnico());
      await db('restablecimientos').update({ expira_en: db.raw("creado_en - interval '1 second'") });

      const res = await request(app)
        .post('/api/v1/auth/restablecer')
        .send({ token: tokenDe(enviador.enviados[0]), password: NUEVA });

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('TOKEN_RECUPERACION_INVALIDO');
    });

    it('si falla el envío de la invitación responde 201 con invitacionEnviada: false y el usuario existe', async () => {
      enviador.fallar = true;
      const consola = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await comoAdmin.post(BASE, altaTecnico());

        expect(res.status).toBe(201);
        expect(res.body.invitacionEnviada).toBe(false);
        expect(await db('usuarios').where({ email: 'tomas@vozmuni.test' }).first('id')).toBeDefined();
        expect(consola).toHaveBeenCalledWith(expect.stringContaining('invitacion_usuario'));
      } finally {
        consola.mockRestore();
      }
    });

    it.each([
      ['correo existente en mayúsculas', () => ({ email: 'ADMIN@VozMuni.test' }), 409, 'EMAIL_DUPLICADO'],
      ['rol vecino', () => ({ rol: 'vecino' }), 400, 'ROL_NO_PERMITIDO'],
      ['técnico sin dependencia', () => ({ dependenciaId: undefined }), 400, 'DEPENDENCIA_REQUERIDA'],
      ['supervisor con dependencia', () => ({ rol: 'supervisor' }), 400, 'DEPENDENCIA_NO_PERMITIDA'],
      ['dependencia inactiva', () => ({ dependenciaId: inactiva }), 400, 'DEPENDENCIA_INVALIDA'],
      ['dependencia inexistente', () => ({ dependenciaId: 999999 }), 400, 'DEPENDENCIA_INVALIDA'],
      ['DPI de 12 dígitos', () => ({ dpi: '254712345010' }), 400, 'DPI_INVALIDO'],
    ])('rechaza %s', async (_caso, cambios, status, codigo) => {
      const res = await comoAdmin.post(BASE, { ...altaTecnico(), ...cambios() });

      expect(res.status).toBe(status);
      expect(res.body).toEqual({ codigo, mensaje: expect.any(String) });
      expect(enviador.enviados).toEqual([]);
    });

    it('un DPI repetido responde 409 DPI_DUPLICADO aunque el existente sea de un vecino', async () => {
      await crearUsuario('vecino@vozmuni.test', 'vecino', { dpi: '2547123450101' });

      const res = await comoAdmin.post(BASE, altaTecnico());

      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('DPI_DUPLICADO');
    });

    it('un correo de un vecino también es duplicado', async () => {
      await crearUsuario('tomas@vozmuni.test', 'vecino');

      expect((await comoAdmin.post(BASE, altaTecnico())).body.codigo).toBe('EMAIL_DUPLICADO');
    });
  });

  describe('listado y detalle', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 22; i++) {
        await crearUsuario(`receptor${String(i).padStart(2, '0')}@vozmuni.test`, 'receptor');
      }
      await crearUsuario('tec.obras@vozmuni.test', 'tecnico', { dependencia_id: obras, nombre: 'Tec Obras' });
      await crearUsuario('tec.agua@vozmuni.test', 'tecnico', { dependencia_id: agua, activo: false, nombre: 'Tec Agua' });
      await crearUsuario('vecino@vozmuni.test', 'vecino');
    });

    it('pagina 20 por defecto, ordena por nombre y no incluye vecinos', async () => {
      const res = await comoAdmin.get(BASE);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ pagina: 1, tamano: 20, total: 25 });
      expect(res.body.datos).toHaveLength(20);
      const nombres = res.body.datos.map((u: { nombre: string }) => u.nombre);
      expect(nombres).toEqual([...nombres].sort());
      const segunda = await comoAdmin.get(`${BASE}?pagina=2`);
      expect(segunda.body.datos).toHaveLength(5);
      expect([...res.body.datos, ...segunda.body.datos].some((u: { rol: string }) => u.rol === 'vecino')).toBe(false);
    });

    it('filtra por rol, dependencia, estado y búsqueda', async () => {
      expect((await comoAdmin.get(`${BASE}?rol=tecnico`)).body.total).toBe(2);
      expect((await comoAdmin.get(`${BASE}?dependenciaId=${obras}`)).body.datos.map((u: { email: string }) => u.email)).toEqual([
        'tec.obras@vozmuni.test',
      ]);
      expect((await comoAdmin.get(`${BASE}?activo=false`)).body.total).toBe(1);
      expect((await comoAdmin.get(`${BASE}?busqueda=TEC.`)).body.total).toBe(2);
      expect((await comoAdmin.get(`${BASE}?busqueda=receptor1&tamano=100`)).body.total).toBe(10);
      expect((await comoAdmin.get(`${BASE}?busqueda=%25`)).body.total).toBe(0);
    });

    it('rechaza un tamaño mayor que 100 y un rol inválido', async () => {
      expect((await comoAdmin.get(`${BASE}?tamano=101`)).body.codigo).toBe('VALIDACION');
      expect((await comoAdmin.get(`${BASE}?rol=vecino`)).body.codigo).toBe('ROL_NO_PERMITIDO');
    });

    it('el detalle de un vecino o de un id inexistente responde 404', async () => {
      const vecino = await db('usuarios').where({ email: 'vecino@vozmuni.test' }).first('id');

      expect((await comoAdmin.get(`${BASE}/${vecino.id}`)).status).toBe(404);
      expect((await comoAdmin.get(`${BASE}/999999`)).body.codigo).toBe('NO_ENCONTRADO');
      expect((await comoAdmin.get(`${BASE}/${adminId}`)).body).toMatchObject({ id: adminId, rol: 'administrador' });
    });
  });

  describe('edición', () => {
    it('cambiar el rol revoca las sesiones; cambiar solo el nombre no', async () => {
      const id = await crearUsuario('tec@vozmuni.test', 'tecnico', { dependencia_id: obras });
      const { body: sesion } = await login('tec@vozmuni.test');

      const nombre = await comoAdmin.patch(`${BASE}/${id}`, { nombre: '  Técnico Renombrado  ', telefono: '55551234' });
      expect(nombre.status).toBe(200);
      expect(nombre.body).toMatchObject({ nombre: 'Técnico Renombrado', telefono: '55551234' });
      expect((await request(app).get('/api/v1/auth/sesion').set('Authorization', `Bearer ${sesion.accessToken}`)).status).toBe(200);

      const rol = await comoAdmin.patch(`${BASE}/${id}`, { rol: 'supervisor', dependenciaId: null });
      expect(rol.status).toBe(200);
      expect(rol.body).toMatchObject({ rol: 'supervisor', dependenciaId: null });
      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: sesion.refreshToken })).status).toBe(401);
    });

    it('valida la dependencia sobre el estado final y rechaza campos no editables', async () => {
      const id = await crearUsuario('tec@vozmuni.test', 'tecnico', { dependencia_id: obras });

      expect((await comoAdmin.patch(`${BASE}/${id}`, { rol: 'supervisor' })).body.codigo).toBe('DEPENDENCIA_NO_PERMITIDA');
      for (const cuerpo of [{ email: 'otro@vozmuni.test' }, { dpi: '2547123450101' }, { activo: false }, {}]) {
        const res = await comoAdmin.patch(`${BASE}/${id}`, cuerpo);
        expect(res.status).toBe(400);
        expect(res.body.codigo).toBe('VALIDACION');
      }
    });

    it('un administrador no puede quitarse el rol a sí mismo', async () => {
      await crearUsuario('admin2@vozmuni.test', 'administrador');

      const res = await comoAdmin.patch(`${BASE}/${adminId}`, { rol: 'supervisor' });

      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('OPERACION_SOBRE_SI_MISMO');
    });
  });

  describe('desactivación, reactivación y desbloqueo', () => {
    it('desactivar impide entrar, invalida el token vigente y avisa; reactivar permite volver', async () => {
      const id = await crearUsuario('tec@vozmuni.test', 'tecnico', { dependencia_id: obras });
      const acceso = await tokenDeAcceso('tec@vozmuni.test');

      const res = await comoAdmin.post(`${BASE}/${id}/desactivacion`);

      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(false);
      expect((await login('tec@vozmuni.test')).status).toBe(401);
      expect((await request(app).get('/api/v1/auth/sesion').set('Authorization', `Bearer ${acceso}`)).status).toBe(401);
      const [aviso] = await esperarCorreos(enviador, 1);
      expect(aviso).toMatchObject({ para: 'tec@vozmuni.test', asunto: 'VozMuni: tu cuenta fue desactivada' });
      expect((await comoAdmin.post(`${BASE}/${id}/desactivacion`)).status).toBe(200);

      const reactivado = await comoAdmin.post(`${BASE}/${id}/activacion`);
      expect(reactivado.body.activo).toBe(true);
      expect((await login('tec@vozmuni.test')).status).toBe(200);
      expect((await comoAdmin.post(`${BASE}/${id}/activacion`)).status).toBe(200);
    });

    it('protege a los administradores', async () => {
      const yoMismo = await comoAdmin.post(`${BASE}/${adminId}/desactivacion`);
      expect(yoMismo.status).toBe(409);
      expect(yoMismo.body.codigo).toBe('OPERACION_SOBRE_SI_MISMO');

      // Con dos administradores, el segundo desactiva al primero y después ya no puede desactivarse a sí mismo.
      const segundoId = await crearUsuario('admin2@vozmuni.test', 'administrador');
      const segundo = await tokenDeAcceso('admin2@vozmuni.test');
      expect((await comoAdmin.post(`${BASE}/${adminId}/desactivacion`, {}, () => segundo)).status).toBe(200);
      const res = await comoAdmin.post(`${BASE}/${segundoId}/desactivacion`, {}, () => segundo);
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('OPERACION_SOBRE_SI_MISMO');
    });

    it('nunca deja 0 administradores activos', async () => {
      // Por la API solo un administrador activo puede pedirlo, y eso ya cubre OPERACION_SOBRE_SI_MISMO.
      // El caso del último administrador se prueba con el servicio real, como si actuara otro usuario.
      const otroId = await crearUsuario('admin2@vozmuni.test', 'administrador', { activo: false });

      await expect(container.usuariosService.desactivar(otroId, adminId)).rejects.toMatchObject({
        codigo: 'ULTIMO_ADMINISTRADOR',
      });
      expect(await db('usuarios').where({ id: adminId }).first('activo')).toEqual({ activo: true });
    });

    it('el desbloqueo permite entrar de inmediato a un usuario bloqueado', async () => {
      const id = await crearUsuario('tec@vozmuni.test', 'tecnico', { dependencia_id: obras });
      for (let i = 0; i < 5; i++) {
        await login('tec@vozmuni.test', 'incorrecta');
      }
      expect((await login('tec@vozmuni.test')).status).toBe(423);

      const res = await comoAdmin.post(`${BASE}/${id}/desbloqueo`);

      expect(res.status).toBe(200);
      expect(res.body.bloqueadoHasta).toBeNull();
      expect((await login('tec@vozmuni.test')).status).toBe(200);
    });
  });

  describe('/auth/recuperar con la invitación vencida', () => {
    it('envía un enlace nuevo a un usuario interno sin contraseña y nada a un vecino sin contraseña', async () => {
      await comoAdmin.post(BASE, altaTecnico());
      await db('restablecimientos').update({ expira_en: db.raw("now() - interval '1 second'") });
      await crearUsuario('vecino@vozmuni.test', 'vecino', { password_hash: null });

      const interno = await request(app).post('/api/v1/auth/recuperar').send({ email: 'tomas@vozmuni.test' });
      const vecino = await request(app).post('/api/v1/auth/recuperar').send({ email: 'vecino@vozmuni.test' });

      expect(interno.status).toBe(202);
      expect(vecino.body).toEqual(interno.body);
      const correos = await esperarCorreos(enviador, 2);
      await new Promise((resolver) => setTimeout(resolver, 150));
      expect(correos.map((correo) => [correo.para, correo.asunto])).toEqual([
        ['tomas@vozmuni.test', 'VozMuni: activa tu cuenta'],
        ['tomas@vozmuni.test', 'VozMuni: restablece tu contraseña'],
      ]);
      const restablecido = await request(app)
        .post('/api/v1/auth/restablecer')
        .send({ token: tokenDe(correos[1]), password: NUEVA });
      expect(restablecido.status).toBe(200);
    });
  });
});
