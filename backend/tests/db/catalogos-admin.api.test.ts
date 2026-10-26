import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';
import { prepararSla } from './sla-fixtures';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

// /api/v1/admin/{dependencias,categorias,zonas} (SPEC 40) contra PostgreSQL.
describe('Administración de dependencias, categorías y zonas (SPEC 40)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await prepararSla(db, []); // el calendario, para aceptar quejas (SPEC 30)

    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ['administrador', 'supervisor', 'coordinador', 'vecino']) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${rol}@catalogos.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${rol}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date() })
        .returning('id');
      ids[rol] = Number(fila.id);
      tokens[rol] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
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

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const admin = {
    get: (ruta: string, quien = 'administrador') => request(app).get(`/api/v1/admin${ruta}`).set(auth(quien)),
    post: (ruta: string, cuerpo: object, quien = 'administrador') =>
      request(app).post(`/api/v1/admin${ruta}`).set(auth(quien)).send(cuerpo),
    patch: (ruta: string, cuerpo: object, quien = 'administrador') =>
      request(app).patch(`/api/v1/admin${ruta}`).set(auth(quien)).send(cuerpo),
  };
  const nombres = (res: { body: { datos?: { nombre: string }[] } | { nombre: string }[] }) =>
    (Array.isArray(res.body) ? res.body : res.body.datos!).map((x) => x.nombre);

  async function dependencia(nombre: string): Promise<number> {
    return (await admin.post('/dependencias', { nombre })).body.id;
  }

  // Una categoría activa: creada por la API, con su SLA y activada.
  async function categoriaActiva(nombre: string, dependenciaId: number): Promise<number> {
    const id = (await admin.post('/categorias', { nombre, dependenciaId })).body.id;
    await prepararSla(db, [id]);
    expect((await admin.patch(`/categorias/${id}`, { activa: true })).status).toBe(200);
    return id;
  }

  async function zona(nombre: string, tipo = 'zona'): Promise<number> {
    return (await admin.post('/zonas', { nombre, tipo })).body.id;
  }

  async function queja(categoriaId: number, dependenciaId: number | null, estado: EstadoTicket, zonaId: number): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: categoriaId,
        dependencia_id: dependenciaId,
        zona_id: zonaId,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Un bache grande que ya dañó dos carros',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: dependenciaId === null ? null : 'media',
      })
      .returning('id');
    return Number(fila.id);
  }

  describe('dependencias', () => {
    it('crear → 201 activa; el nombre se normaliza, y un repetido con otras mayúsculas → 409 NOMBRE_DUPLICADO', async () => {
      const res = await admin.post('/dependencias', { nombre: '  Dirección   de Parques ' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        nombre: 'Dirección de Parques',
        activa: true,
        categoriasActivas: 0,
        usuariosActivos: 0,
        quejasAbiertas: 0,
      });
      const repetida = await admin.post('/dependencias', { nombre: 'dirección de parques' });
      expect(repetida.status).toBe(409);
      expect(repetida.body.codigo).toBe('NOMBRE_DUPLICADO');
      expect((await admin.post('/dependencias', { nombre: '   ' })).body.codigo).toBe('NOMBRE_INVALIDO');
    });

    it('listar muestra activas e inactivas con sus contadores; renombrar → 200', async () => {
      const id = await dependencia('Agua Potable');
      const categoria = await categoriaActiva('Fugas', id);
      const zonaId = await zona('Zona Contadores');
      await db('usuarios').where({ id: ids.coordinador }).update({ dependencia_id: id });
      await queja(categoria, id, 'en_proceso', zonaId);
      await queja(categoria, id, 'cerrada', zonaId);

      const fila = (await admin.get('/dependencias')).body.datos.find((d: { id: number }) => d.id === id);
      expect(fila).toMatchObject({ categoriasActivas: 1, usuariosActivos: 1, quejasAbiertas: 1 });

      const renombrada = await admin.patch(`/dependencias/${id}`, { nombre: 'Aguas Municipales' });
      expect(renombrada.status).toBe(200);
      expect(renombrada.body.nombre).toBe('Aguas Municipales');
      await db('usuarios').where({ id: ids.coordinador }).update({ dependencia_id: null });
    });

    it('desactivar con categorías activas → 409 DEPENDENCIA_EN_USO con ellas; sin ellas → 200 y sale de GET /dependencias', async () => {
      const id = await dependencia('Dirección de Obras');
      const baches = await categoriaActiva('Baches', id);
      // Las quejas abiertas no bloquean.
      await queja(baches, id, 'en_proceso', await zona('Zona Obras'));

      const enUso = await admin.patch(`/dependencias/${id}`, { activa: false });
      expect(enUso.status).toBe(409);
      expect(enUso.body).toMatchObject({ codigo: 'DEPENDENCIA_EN_USO', detalles: [{ id: baches, nombre: 'Baches' }] });

      await admin.patch(`/categorias/${baches}`, { activa: false });
      const desactivada = await admin.patch(`/dependencias/${id}`, { activa: false });
      expect(desactivada.status).toBe(200);
      expect(desactivada.body).toMatchObject({ activa: false, quejasAbiertas: 1 });
      const visibles = await request(app).get('/api/v1/dependencias').set(auth('supervisor'));
      expect(nombres(visibles)).not.toContain('Dirección de Obras');
      expect(nombres(await admin.get('/dependencias'))).toContain('Dirección de Obras');
    });

    it('un id inexistente → 404; un cuerpo vacío o con campos extra → 400', async () => {
      expect((await admin.patch('/dependencias/999999', { nombre: 'X' })).status).toBe(404);
      expect((await admin.patch('/dependencias/999999', {})).status).toBe(400);
      expect((await admin.post('/dependencias', { nombre: 'X', activa: false })).status).toBe(400);
    });
  });

  describe('categorías', () => {
    it('crear nace inactiva y sin campos adicionales; con una dependencia inactiva → 409 DEPENDENCIA_INACTIVA', async () => {
      const id = await dependencia('Alumbrado Público');

      const res = await admin.post('/categorias', { nombre: 'Lámparas apagadas', dependenciaId: id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        nombre: 'Lámparas apagadas',
        activa: false,
        dependencia: { id, nombre: 'Alumbrado Público', activa: true },
        camposExtra: 0,
        slaCompleto: false,
      });
      expect(await db('categorias').where({ id: res.body.id }).first('campos_extra')).toEqual({ campos_extra: [] });

      const inactiva = await dependencia('Dependencia cerrada');
      await admin.patch(`/dependencias/${inactiva}`, { activa: false });
      expect((await admin.post('/categorias', { nombre: 'Otra', dependenciaId: inactiva })).body.codigo).toBe('DEPENDENCIA_INACTIVA');
      expect((await admin.post('/categorias', { nombre: 'Otra', dependenciaId: 999999 })).status).toBe(400);
    });

    it('activar sin SLA → 409 SLA_INCOMPLETO; con el SLA → 200 y aparece en GET /categorias; desactivar la oculta', async () => {
      const dep = await dependencia('Parques');
      const id = (await admin.post('/categorias', { nombre: 'Árboles caídos', dependenciaId: dep })).body.id;

      const sinSla = await admin.patch(`/categorias/${id}`, { activa: true });
      expect(sinSla.status).toBe(409);
      expect(sinSla.body.codigo).toBe('SLA_INCOMPLETO');

      await prepararSla(db, [id]);
      const activada = await admin.patch(`/categorias/${id}`, { activa: true });
      expect(activada.body).toMatchObject({ activa: true, slaCompleto: true });
      const formulario = () => request(app).get('/api/v1/categorias').set(auth('vecino'));
      expect(nombres(await formulario())).toContain('Árboles caídos');

      await admin.patch(`/categorias/${id}`, { activa: false });
      expect(nombres(await formulario())).not.toContain('Árboles caídos');
    });

    it('mover a otra dependencia no cambia las quejas existentes, y una aceptación posterior usa la nueva', async () => {
      const vieja = await dependencia('Servicios Generales');
      const nueva = await dependencia('Mantenimiento Urbano');
      const categoria = await categoriaActiva('Banquetas rotas', vieja);
      const zonaId = await zona('Zona Banquetas');
      const aceptada = await queja(categoria, vieja, 'asignada', zonaId);
      const enRevision = await queja(categoria, null, 'en_revision', zonaId);

      const movida = await admin.patch(`/categorias/${categoria}`, { dependenciaId: nueva });

      expect(movida.status).toBe(200);
      expect(movida.body.dependencia).toEqual({ id: nueva, nombre: 'Mantenimiento Urbano', activa: true });
      expect(await db('tickets').where({ id: aceptada }).first('dependencia_id')).toEqual({ dependencia_id: String(vieja) });
      const aceptar = await request(app)
        .post(`/api/v1/tickets/${enRevision}/transiciones`)
        .set(auth('supervisor'))
        .send({ accion: 'aceptar', prioridad: 'media' });
      expect(aceptar.status).toBe(200);
      expect(await db('tickets').where({ id: enRevision }).first('dependencia_id')).toEqual({ dependencia_id: String(nueva) });
    });

    it('un nombre repetido → 409; un id inexistente → 404', async () => {
      const dep = await dependencia('Limpieza');
      await admin.post('/categorias', { nombre: 'Basura', dependenciaId: dep });
      expect((await admin.post('/categorias', { nombre: 'BASURA', dependenciaId: dep })).body.codigo).toBe('NOMBRE_DUPLICADO');
      expect((await admin.patch('/categorias/999999', { activa: true })).status).toBe(404);
    });
  });

  describe('zonas', () => {
    it('crear, renombrar y cambiar el tipo; el mismo nombre con otro tipo se permite, con el mismo → 409', async () => {
      const res = await admin.post('/zonas', { nombre: 'El Mirador', tipo: 'colonia' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: expect.any(Number), nombre: 'El Mirador', tipo: 'colonia', activa: true });

      expect((await admin.post('/zonas', { nombre: 'el mirador', tipo: 'aldea' })).status).toBe(201);
      expect((await admin.post('/zonas', { nombre: 'EL MIRADOR', tipo: 'colonia' })).body.codigo).toBe('NOMBRE_DUPLICADO');
      expect((await admin.post('/zonas', { nombre: 'Otra', tipo: 'barrio' })).status).toBe(400);

      const editada = await admin.patch(`/zonas/${res.body.id}`, { nombre: 'Mirador Alto', tipo: 'zona' });
      expect(editada.body).toMatchObject({ nombre: 'Mirador Alto', tipo: 'zona' });
    });

    it('desactivar la oculta de GET /zonas, y registrar una queja con ella falla igual que con una inexistente', async () => {
      const dep = await dependencia('Registro');
      const categoria = await categoriaActiva('Señales caídas', dep);
      const id = await zona('Zona Desactivada');
      expect((await admin.patch(`/zonas/${id}`, { activa: false })).body.activa).toBe(false);

      const formulario = await request(app).get('/api/v1/zonas').set(auth('vecino'));
      expect(nombres(formulario)).not.toContain('Zona Desactivada');
      const registrar = (zonaId: number) =>
        request(app)
          .post('/api/v1/tickets')
          .set(auth('vecino'))
          .send({ categoriaId: categoria, zonaId, titulo: 'Señal caída en la esquina', descripcion: 'Se cayó la señal de alto con el viento', direccion: '3a calle 4-10' });
      const conInactiva = await registrar(id);
      const conInexistente = await registrar(999999);
      // El mismo error que una zona inexistente (el mensaje solo nombra el id).
      expect([conInactiva.status, conInactiva.body.codigo]).toEqual([400, 'ZONA_INVALIDA']);
      expect([conInexistente.status, conInexistente.body.codigo]).toEqual([400, 'ZONA_INVALIDA']);
      expect(conInactiva.body.mensaje).toBe(`La zona ${id} no existe`);
      expect(nombres(await admin.get('/zonas'))).toContain('Zona Desactivada');
    });
  });

  it('los roles sin admin.catalogos → 403 y sin sesión → 401 en todos los endpoints', async () => {
    const rutas: [string, string][] = [
      ['get', '/dependencias'],
      ['post', '/dependencias'],
      ['patch', '/dependencias/1'],
      ['get', '/categorias'],
      ['post', '/categorias'],
      ['patch', '/categorias/1'],
      ['get', '/zonas'],
      ['post', '/zonas'],
      ['patch', '/zonas/1'],
    ];
    for (const [metodo, ruta] of rutas) {
      for (const quien of ['supervisor', 'coordinador', 'vecino']) {
        const res = await (request(app) as unknown as Record<string, (r: string) => request.Test>)
          [metodo](`/api/v1/admin${ruta}`)
          .set(auth(quien))
          .send({ nombre: 'X' });
        expect([metodo, ruta, quien, res.status]).toEqual([metodo, ruta, quien, 403]);
      }
      const sinSesion = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo](`/api/v1/admin${ruta}`);
      expect(sinSesion.status).toBe(401);
    }
  });
});
