import path from 'node:path';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');
const PASSWORD_DESARROLLO = 'Desarrollo2026';
const ROLES = ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'] as const;

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(): Promise<void> {}
}

describe('GET /api/v1/tickets/gestion (SPEC 45)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const t: Record<string, number> = {};
  const numeros: Record<string, string> = {};
  let correlativo = 1;

  async function ticket(
    clave: string,
    estado: EstadoTicket,
    creadoEn: string,
    cambios: Record<string, unknown> = {},
  ): Promise<void> {
    const numero = `Q-2026-${String(correlativo++).padStart(6, '0')}`;
    const [fila] = await db('tickets')
      .insert({
        numero,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'alta',
        asignado_a: ids.tecnico,
        creado_en: new Date(creadoEn),
        ...cambios,
      })
      .returning('id');
    t[clave] = Number(fila.id);
    numeros[clave] = numero;
  }

  const get = (rol: string, query = '') =>
    request(app).get(`/api/v1/tickets/gestion${query}`).set('Authorization', `Bearer ${tokens[rol]}`);
  const lista = async (rol: string, query = '') => {
    const res = await get(rol, query);
    expect(res.status).toBe(200);
    return res.body.datos.map((x: { id: number }) => x.id) as number[];
  };
  const claves = (...lista: string[]) => lista.map((clave) => t[clave]);

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });

    for (const rol of ROLES) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@vozmuni.test`, password: PASSWORD_DESARROLLO });
      tokens[rol] = res.body.accessToken;
      ids[rol] = Number((await db('usuarios').where({ email: `${rol}@vozmuni.test` }).first('id')).id);
    }
    ids.obras = Number((await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id')).id);
    ids.baches = Number((await db('categorias').where({ nombre: 'Baches' }).first('id')).id);
    ids.zona = Number((await db('zonas').first('id')).id);

    const [otra] = await db('dependencias').insert({ nombre: 'Dependencia de gestión', activa: true }).returning('id');
    ids.otra = Number(otra.id);
    const [fuga] = await db('categorias')
      .insert({ nombre: 'Fuga de gestión', dependencia_id: ids.otra, activa: true })
      .returning('id');
    ids.fuga = Number(fuga.id);
    const [inactiva] = await db('dependencias').insert({ nombre: 'Dependencia inactiva', activa: false }).returning('id');
    ids.inactiva = Number(inactiva.id);
    const [catInactiva] = await db('categorias')
      .insert({ nombre: 'Categoría inactiva', dependencia_id: ids.inactiva, activa: false })
      .returning('id');
    ids.catInactiva = Number(catInactiva.id);
    const rolTecnico = (await db('roles').where({ nombre: 'tecnico' }).first('id')).id;
    const [otroTecnico] = await db('usuarios')
      .insert({ nombre: 'Técnico inactivo de gestión', email: 'tecnico-gestion@vozmuni.test', rol_id: rolTecnico, dependencia_id: ids.otra, activo: false })
      .returning('id');
    ids.otroTecnico = Number(otroTecnico.id);

    // Orden esperado para el supervisor: B (escalada), G, H, D (alta por antigüedad), A (media), E (sin prioridad),
    // y las finalizadas F, R, C de la más reciente a la más antigua.
    await ticket('A', 'asignada', '2026-10-02T15:00:00Z', { prioridad: 'media', registrado_por: ids.receptor });
    await ticket('B', 'en_proceso', '2026-10-20T15:00:00Z', {
      prioridad: 'urgente',
      escalado: true,
      escalado_en: new Date('2026-10-21T15:00:00Z'),
      escalado_por: 'respuesta',
    });
    await ticket('C', 'cerrada', '2026-09-01T15:00:00Z', { cerrado_en: new Date('2026-09-10T15:00:00Z') });
    await ticket('D', 'asignada', '2026-10-05T15:00:00Z', {
      dependencia_id: ids.otra,
      categoria_id: ids.fuga,
      asignado_a: null,
      titulo: 'Fuga de agua en la calle',
    });
    await ticket('E', 'nueva', '2026-09-15T15:00:00Z', {
      dependencia_id: null,
      prioridad: null,
      asignado_a: null,
      registrado_por: ids.receptor,
    });
    await ticket('F', 'resuelta', '2026-10-15T15:00:00Z', { prioridad: 'baja', resuelto_en: new Date('2026-10-16T15:00:00Z') });
    await ticket('G', 'asignada', '2026-10-01T05:59:59Z', { asignado_a: null }); // 30 de septiembre en Guatemala
    await ticket('H', 'asignada', '2026-10-01T06:00:00Z'); // 1 de octubre, 00:00 en Guatemala
    await ticket('R', 'rechazada', '2026-10-10T15:00:00Z', { dependencia_id: null, prioridad: null, asignado_a: null });
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  describe('alcance y orden', () => {
    it('el supervisor ve todas: abiertas escaladas, abiertas por prioridad y antigüedad, y finalizadas recientes primero', async () => {
      expect(await lista('supervisor')).toEqual(claves('B', 'G', 'H', 'D', 'A', 'E', 'F', 'R', 'C'));
    });

    it('el administrador también ve todas', async () => {
      expect(await lista('administrador')).toEqual(claves('B', 'G', 'H', 'D', 'A', 'E', 'F', 'R', 'C'));
    });

    it('el coordinador solo ve su dependencia, cerradas y resueltas incluidas', async () => {
      expect(await lista('coordinador')).toEqual(claves('B', 'G', 'H', 'A', 'F', 'C'));
    });

    it('el coordinador que pide otra dependencia recibe una lista vacía', async () => {
      const res = await get('coordinador', `?dependenciaId=${ids.otra}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ datos: [], total: 0 });
    });

    it('el técnico solo ve sus asignadas', async () => {
      expect(await lista('tecnico')).toEqual(claves('B', 'H', 'A', 'F', 'C'));
    });

    it('el receptor ve las que registró', async () => {
      expect(await lista('receptor')).toEqual(claves('A', 'E'));
    });

    it('el vecino recibe 403', async () => {
      const res = await get('vecino');
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('PERMISO_DENEGADO');
    });

    it('sin sesión recibe 401', async () => {
      expect((await request(app).get('/api/v1/tickets/gestion')).status).toBe(401);
    });

    it('pagina con total', async () => {
      const primera = await get('supervisor', '?tamano=4');
      const tercera = await get('supervisor', '?tamano=4&pagina=3');
      expect(primera.body).toMatchObject({ pagina: 1, tamano: 4, total: 9 });
      expect(primera.body.datos).toHaveLength(4);
      expect(tercera.body.datos.map((x: { id: number }) => x.id)).toEqual(claves('C'));
    });
  });

  describe('filtros', () => {
    it.each([
      ['un estado', '?estado=asignada', ['G', 'H', 'D', 'A']],
      ['varios estados', '?estado=asignada&estado=cerrada', ['G', 'H', 'D', 'A', 'C']],
      ['q en el título', '?q=fuga', ['D']],
      ['dependenciaId', 'DEPENDENCIA', ['D']],
      ['categoriaId', 'CATEGORIA', ['D']],
      ['prioridad', '?prioridad=alta', ['G', 'H', 'D', 'C']],
      ['desde en el borde del día de Guatemala', '?desde=2026-10-01', ['B', 'H', 'D', 'A', 'F', 'R']],
      ['hasta en el borde del día de Guatemala', '?hasta=2026-09-30', ['G', 'E', 'C']],
      ['un solo día', '?desde=2026-10-01&hasta=2026-10-01', ['H']],
      ['tecnico=<id>', 'TECNICO', ['B', 'H', 'A', 'F', 'C']],
      ['tecnico=sin_asignar', '?tecnico=sin_asignar', ['G', 'D', 'E', 'R']],
      ['varios combinados con AND', 'COMBINADOS', ['G']],
    ])('%s', async (_caso, query, esperadas) => {
      const reemplazos: Record<string, string> = {
        DEPENDENCIA: `?dependenciaId=${ids.otra}`,
        CATEGORIA: `?categoriaId=${ids.fuga}`,
        TECNICO: `?tecnico=${ids.tecnico}`,
        COMBINADOS: `?dependenciaId=${ids.obras}&prioridad=alta&tecnico=sin_asignar&estado=asignada`,
      };
      expect(await lista('supervisor', reemplazos[query] ?? query)).toEqual(claves(...esperadas));
    });

    it('q con un número completo busca exacto, en minúsculas también', async () => {
      expect(await lista('supervisor', `?q=${numeros.A.toLowerCase()}`)).toEqual(claves('A'));
    });

    it('los filtros se intersecan con el alcance del técnico', async () => {
      expect(await lista('tecnico', '?tecnico=sin_asignar')).toEqual([]);
      expect(await lista('tecnico', '?estado=cerrada&estado=resuelta')).toEqual(claves('F', 'C'));
    });

    it.each([
      ['tamano = 51', '?tamano=51'],
      ['un estado desconocido', '?estado=abierta'],
      ['un estado repetido', '?estado=nueva&estado=nueva'],
      ['q de 1 carácter', '?q=a'],
      ['una prioridad desconocida', '?prioridad=critica'],
      ['un técnico no numérico', '?tecnico=juan'],
      ['dependenciaId = 0', '?dependenciaId=0'],
      ['un parámetro desconocido', '?zonaId=1'],
    ])('%s → 400 VALIDACION', async (_caso, query) => {
      const res = await get('supervisor', query);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });

    it.each([
      ['hasta < desde', '?desde=2026-10-05&hasta=2026-10-01'],
      ['una fecha que no existe', '?desde=2026-02-30'],
      ['un formato inválido', '?hasta=01/10/2026'],
    ])('%s → 400 RANGO_INVALIDO', async (_caso, query) => {
      const res = await get('supervisor', query);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('RANGO_INVALIDO');
    });
  });

  describe('respuesta', () => {
    it('trae los datos de la fila con el SLA de SPEC 30 y sin datos personales', async () => {
      const res = await get('supervisor', `?q=${numeros.B}`);
      expect(res.body.datos[0]).toEqual({
        id: t.B,
        numero: numeros.B,
        titulo: 'Bache frente a la escuela',
        estado: 'en_proceso',
        prioridad: 'urgente',
        categoria: { id: ids.baches, nombre: 'Baches' },
        dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
        zona: { id: ids.zona, nombre: expect.any(String) },
        tecnico: { id: ids.tecnico, nombre: 'Técnico de desarrollo' },
        creadoEn: '2026-10-20T15:00:00.000Z',
        sla: {
          venceRespuesta: null,
          primeraRespuestaEn: null,
          venceResolucion: null,
          pausado: false,
          restanteMinutosEnPausa: null,
          escalado: true,
          escaladoEn: '2026-10-21T15:00:00.000Z',
          escaladoPor: 'respuesta',
        },
      });
      const sinAsignar = (await get('supervisor', `?q=${numeros.E}`)).body.datos[0];
      expect(sinAsignar).toMatchObject({ estado: 'nueva', prioridad: null, dependencia: null, tecnico: null });
    });

    it('no incluye correo, teléfono ni DPI del solicitante', async () => {
      const texto = JSON.stringify((await get('supervisor')).body);
      expect(texto).not.toContain('vecino@vozmuni.test');
      expect(texto).not.toContain('55550000');
      expect(texto).not.toMatch(/"(email|telefono|dpi|solicitante)/);
    });

    it('/gestion no se interpreta como un id y GET /tickets/:id sigue funcionando', async () => {
      expect((await get('supervisor')).body).toHaveProperty('total');
      const detalle = await request(app).get(`/api/v1/tickets/${t.A}`).set('Authorization', `Bearer ${tokens.supervisor}`);
      expect(detalle.status).toBe(200);
      expect(detalle.body.numero).toBe(numeros.A);
    });
  });

  describe('GET /api/v1/tickets/gestion/opciones', () => {
    const opciones = (rol: string) =>
      request(app).get('/api/v1/tickets/gestion/opciones').set('Authorization', `Bearer ${tokens[rol]}`);

    it('el coordinador recibe su dependencia, sus categorías y sus técnicos', async () => {
      const res = await opciones('coordinador');
      expect(res.status).toBe(200);
      expect(res.body.dependencias).toEqual([{ id: ids.obras, nombre: 'Dirección de Obras', activa: true }]);
      expect(res.body.categorias.length).toBeGreaterThan(0);
      expect(res.body.categorias.every((c: { dependenciaId: number }) => c.dependenciaId === ids.obras)).toBe(true);
      expect(res.body.categorias).toContainEqual({ id: ids.baches, nombre: 'Baches', dependenciaId: ids.obras, activa: true });
      expect(res.body.tecnicos).toEqual([{ id: ids.tecnico, nombre: 'Técnico de desarrollo', dependenciaId: ids.obras, activo: true }]);
    });

    it('el técnico recibe su dependencia y ningún técnico', async () => {
      const res = await opciones('tecnico');
      expect(res.status).toBe(200);
      expect(res.body.dependencias.map((d: { id: number }) => d.id)).toEqual([ids.obras]);
      expect(res.body.categorias.every((c: { dependenciaId: number }) => c.dependenciaId === ids.obras)).toBe(true);
      expect(res.body.tecnicos).toEqual([]);
    });

    it.each(['supervisor', 'administrador', 'receptor'])('%s recibe todo, inactivos incluidos y ordenado por nombre', async (rol) => {
      const res = await opciones(rol);
      expect(res.status).toBe(200);
      const total = Number((await db('dependencias').count({ n: '*' }))[0].n);
      expect(res.body.dependencias).toHaveLength(total);
      expect(res.body.dependencias).toContainEqual({ id: ids.inactiva, nombre: 'Dependencia inactiva', activa: false });
      expect(res.body.categorias).toContainEqual({ id: ids.catInactiva, nombre: 'Categoría inactiva', dependenciaId: ids.inactiva, activa: false });
      expect(res.body.tecnicos).toContainEqual({ id: ids.otroTecnico, nombre: 'Técnico inactivo de gestión', dependenciaId: ids.otra, activo: false });
      expect(res.body.tecnicos).toContainEqual({ id: ids.tecnico, nombre: 'Técnico de desarrollo', dependenciaId: ids.obras, activo: true });
      const nombres = res.body.dependencias.map((d: { nombre: string }) => d.nombre);
      expect(nombres).toEqual([...nombres].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)));
    });

    it('el vecino recibe 403 y sin sesión 401', async () => {
      expect((await opciones('vecino')).status).toBe(403);
      expect((await request(app).get('/api/v1/tickets/gestion/opciones')).status).toBe(401);
    });

    it('no admite parámetros', async () => {
      const res = await request(app)
        .get('/api/v1/tickets/gestion/opciones?dependenciaId=1')
        .set('Authorization', `Bearer ${tokens.supervisor}`);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });
  });
});
