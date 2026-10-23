import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

// Los correos no importan en esta prueba.
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

// Ejemplo de la spec para Agua potable.
const CAMPOS_AGUA = [
  {
    clave: 'numero_contador',
    etiqueta: 'Número de contador',
    tipo: 'texto',
    requerido: true,
    orden: 1,
    min: 4,
    max: 20,
    patron: '^[0-9-]+$',
  },
  {
    clave: 'tipo_problema',
    etiqueta: 'Tipo de problema',
    tipo: 'seleccion',
    requerido: true,
    orden: 2,
    opciones: [
      { valor: 'fuga', etiqueta: 'Fuga' },
      { valor: 'sin_servicio', etiqueta: 'Sin servicio' },
    ],
  },
];

describe('Campos adicionales por categoría (SPEC 14)', () => {
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

    const [activa, inactiva] = (
      await db('dependencias')
        .insert([
          { nombre: 'Agua', activa: true },
          { nombre: 'Cerrada', activa: false },
        ])
        .returning('id')
    ).map((f) => Number(f.id));
    const categorias = await db('categorias')
      .insert([
        { nombre: 'Agua potable', dependencia_id: activa },
        { nombre: 'Alumbrado', dependencia_id: activa },
        { nombre: 'Vieja', dependencia_id: activa, activa: false },
        { nombre: 'De dependencia cerrada', dependencia_id: inactiva },
      ])
      .returning('id');
    [ids.agua, ids.alumbrado, ids.vieja, ids.cerrada] = categorias.map((f) => Number(f.id));
    await db('zonas').insert([
      { nombre: 'Zona 2', tipo: 'zona' },
      { nombre: 'Aldea Norte', tipo: 'aldea' },
      { nombre: 'Zona 1', tipo: 'zona' },
    ]);
    ids.zona = Number((await db('zonas').where({ nombre: 'Zona 1' }).first('id')).id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ['administrador', 'vecino', 'supervisor', 'tecnico']) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      await db('usuarios').insert({
        nombre: `Usuario ${rol}`,
        email: `${rol}@campos.test`,
        rol_id: rolId,
        password_hash: hash,
        dependencia_id: rol === 'tecnico' ? activa : null,
      });
      tokens[rol] = (await request(app).post('/api/v1/auth/login').send({ email: `${rol}@campos.test`, password: PASSWORD })).body.accessToken;
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

  const definir = (categoriaId: number, campos: unknown, quien = 'administrador') =>
    request(app)
      .put(`/api/v1/admin/categorias/${categoriaId}/campos-extra`)
      .set('Authorization', `Bearer ${tokens[quien]}`)
      .send({ campos });

  const registrar = (categoriaId: number, datosExtra?: unknown) =>
    request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.vecino}`)
      .send({
        categoriaId,
        zonaId: ids.zona,
        titulo: 'Fuga en la calle',
        descripcion: 'Sale agua de la tubería desde ayer',
        direccion: '3a calle 4-10, zona 1',
        ...(datosExtra === undefined ? {} : { datosExtra }),
      });

  // Las pruebas siguen un orden: primero sin quejas en Agua potable, después con quejas.
  describe('PUT /admin/categorias/:id/campos-extra', () => {
    it('el administrador define los campos de Agua potable → 200', async () => {
      const res = await definir(ids.agua, CAMPOS_AGUA);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: ids.agua, nombre: 'Agua potable', camposExtra: CAMPOS_AGUA });
      expect((await db('categorias').where({ id: ids.agua }).first('campos_extra')).campos_extra).toEqual(CAMPOS_AGUA);
    });

    it.each(['vecino', 'supervisor', 'tecnico'])('el %s recibe 403', async (quien) => {
      expect((await definir(ids.agua, CAMPOS_AGUA, quien)).status).toBe(403);
    });

    it('sin token responde 401', async () => {
      const res = await request(app).put(`/api/v1/admin/categorias/${ids.agua}/campos-extra`).send({ campos: [] });

      expect(res.status).toBe(401);
    });

    it('una definición inválida → 400 DEFINICION_INVALIDA con detalles', async () => {
      const res = await definir(ids.alumbrado, [{ clave: 'Mal', etiqueta: 'X', tipo: 'texto', requerido: false, orden: 0 }]);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        codigo: 'DEFINICION_INVALIDA',
        mensaje: expect.any(String),
        detalles: [
          { campo: 'campos[0]', problema: 'CLAVE_INVALIDA' },
          { campo: 'campos[0]', problema: 'MAX_INVALIDO' },
        ],
      });
    });

    it('una categoría inexistente → 404, y una inactiva también se puede editar', async () => {
      expect((await definir(999999, [])).status).toBe(404);
      expect((await definir(ids.vieja, [])).status).toBe(200);
    });

    it('un cuerpo sin campos o con propiedades extra → 400 VALIDACION', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/categorias/${ids.agua}/campos-extra`)
        .set('Authorization', `Bearer ${tokens.administrador}`)
        .send({ campos: [], otro: 1 });

      expect(res.body.codigo).toBe('VALIDACION');
    });
  });

  describe('GET /categorias y /zonas', () => {
    it('el vecino ve solo las categorías activas con dependencia activa, con sus camposExtra', async () => {
      const res = await request(app).get('/api/v1/categorias').set('Authorization', `Bearer ${tokens.vecino}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: ids.agua, nombre: 'Agua potable', camposExtra: CAMPOS_AGUA },
        { id: ids.alumbrado, nombre: 'Alumbrado', camposExtra: [] },
      ]);
    });

    it('devuelve todas las zonas ordenadas por tipo y nombre', async () => {
      const res = await request(app).get('/api/v1/zonas').set('Authorization', `Bearer ${tokens.supervisor}`);

      expect(res.status).toBe(200);
      expect(res.body.map((z: { nombre: string; tipo: string }) => `${z.tipo}:${z.nombre}`)).toEqual([
        'aldea:Aldea Norte',
        'zona:Zona 1',
        'zona:Zona 2',
      ]);
    });

    it('exigen sesión y tickets.crear', async () => {
      expect((await request(app).get('/api/v1/categorias')).status).toBe(401);
      expect((await request(app).get('/api/v1/zonas').set('Authorization', `Bearer ${tokens.tecnico}`)).status).toBe(403);
    });
  });

  describe('POST /tickets con datosExtra', () => {
    it('con datos válidos → 201 y guarda numero_contador recortado', async () => {
      const res = await registrar(ids.agua, { numero_contador: '  1234-56  ', tipo_problema: 'fuga' });

      expect(res.status).toBe(201);
      expect((await db('tickets').where({ id: res.body.id }).first('datos_extra')).datos_extra).toEqual({
        numero_contador: '1234-56',
        tipo_problema: 'fuga',
      });
    });

    it('sin numero_contador → 400 DATOS_EXTRA_INVALIDOS, sin crear el ticket ni consumir un número', async () => {
      const antes = await db('correlativos').first('ultimo');
      const tickets = await db('tickets').count({ total: '*' });

      const res = await registrar(ids.agua, { tipo_problema: 'fuga' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        codigo: 'DATOS_EXTRA_INVALIDOS',
        mensaje: expect.any(String),
        detalles: [{ campo: 'numero_contador', problema: 'REQUERIDO' }],
      });
      expect(await db('tickets').count({ total: '*' })).toEqual(tickets);
      expect(await db('correlativos').first('ultimo')).toEqual(antes);
    });

    it('sin datosExtra en una categoría con campos requeridos → 400 con todos los problemas', async () => {
      const res = await registrar(ids.agua);

      expect(res.status).toBe(400);
      expect(res.body.detalles).toEqual([
        { campo: 'numero_contador', problema: 'REQUERIDO' },
        { campo: 'tipo_problema', problema: 'REQUERIDO' },
      ]);
    });

    it('lat, lng, prioridad y estado siguen rechazados', async () => {
      for (const extra of [{ lat: 14.6 }, { lng: -90.5 }, { prioridad: 'alta' }, { estado: 'asignada' }]) {
        const res = await request(app)
          .post('/api/v1/tickets')
          .set('Authorization', `Bearer ${tokens.vecino}`)
          .send({
            categoriaId: ids.alumbrado,
            zonaId: ids.zona,
            titulo: 'Poste apagado',
            descripcion: 'La lámpara no enciende desde el lunes',
            direccion: '5a avenida 3-20, zona 1',
            ...extra,
          });
        expect(res.body.codigo).toBe('VALIDACION');
      }
    });
  });

  describe('compatibilidad con la categoría ya con quejas', () => {
    it('quitar tipo_problema → 409 CAMBIO_INCOMPATIBLE con su detalle', async () => {
      const res = await definir(ids.agua, [CAMPOS_AGUA[0]]);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        codigo: 'CAMBIO_INCOMPATIBLE',
        mensaje: expect.any(String),
        detalles: [{ campo: 'tipo_problema', problema: 'CAMPO_ELIMINADO' }],
      });
    });

    it.each([
      ['agregar un campo nuevo requerido', [...CAMPOS_AGUA, { clave: 'urgente', etiqueta: 'Urgente', tipo: 'si_no', requerido: true, orden: 3 }], 'NUEVO_REQUERIDO'],
      ['cambiar el patron', [{ ...CAMPOS_AGUA[0], patron: '^[0-9]+$' }, CAMPOS_AGUA[1]], 'PATRON_CAMBIADO'],
      ['bajar el max', [{ ...CAMPOS_AGUA[0], max: 10 }, CAMPOS_AGUA[1]], 'LIMITE_ESTRECHADO'],
      ['quitar una opción', [CAMPOS_AGUA[0], { ...CAMPOS_AGUA[1], opciones: [CAMPOS_AGUA[1].opciones![0]] }], 'OPCION_ELIMINADA'],
    ])('%s → 409 %s', async (_caso, campos, problema) => {
      const res = await definir(ids.agua, campos);

      expect(res.status).toBe(409);
      expect(res.body.detalles.map((d: { problema: string }) => d.problema)).toContain(problema);
    });

    it('cambiar solo una etiqueta y agregar un campo opcional → 200', async () => {
      const campos = [
        { ...CAMPOS_AGUA[0], etiqueta: 'Contador del recibo' },
        CAMPOS_AGUA[1],
        { clave: 'urgente', etiqueta: '¿Urgente?', tipo: 'si_no', requerido: false, orden: 3 },
      ];

      const res = await definir(ids.agua, campos);

      expect(res.status).toBe(200);
      expect(res.body.camposExtra[0].etiqueta).toBe('Contador del recibo');
    });
  });
});
