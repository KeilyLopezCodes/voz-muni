import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

describe('Listado y detalle de quejas (SPEC 25)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    ids.obras = Number(obras.id);
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['vecino', 'vecino', null],
      ['otroVecino', 'vecino', null],
      ['tecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['receptor', 'receptor', null],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@lectura.test`,
          telefono: '55550000',
          dpi: String(1000000000000 + usuarios.findIndex(([c]) => c === clave)),
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@lectura.test`, password: PASSWORD });
      tokens[clave] = res.body.accessToken;
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
    await db('comentarios').del();
    await db('ticket_historial').del();
    await db('tickets').del();
  });

  interface OpcionesTicket {
    estado?: EstadoTicket;
    solicitante?: number;
    asignadoA?: number | null;
    creadoEn?: string;
    resolucion?: string | null;
    resueltoPor?: number | null;
  }

  // Una queja en Obras, registrada por el receptor, con coordenadas y prioridad para comprobar que no se exponen.
  async function ticket({
    estado = 'en_proceso',
    solicitante = ids.vecino,
    asignadoA = ids.tecnico,
    creadoEn = '2026-10-20T15:00:00Z',
    resolucion = null,
    resueltoPor = null,
  }: OpcionesTicket = {}): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitante,
        registrado_por: ids.receptor,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'telefono',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'urgente',
        asignado_a: asignadoA,
        lat: 14.634915,
        lng: -90.506882,
        datos_extra: { profundidad: 30 },
        creado_en: creadoEn,
        resolucion,
        resuelto_por: resueltoPor,
        resuelto_en: resolucion === null ? null : '2026-10-23T18:30:00Z',
        cerrado_en: estado === 'cerrada' ? '2026-10-25T18:30:00Z' : null,
      })
      .returning('id');
    return Number(fila.id);
  }

  async function pasoAEspera(id: number, motivo: string, creadoEn: string): Promise<void> {
    await db('ticket_historial').insert({
      ticket_id: id,
      estado_anterior: 'en_proceso',
      estado_nuevo: 'en_espera',
      usuario_id: ids.tecnico,
      motivo,
      creado_en: creadoEn,
    });
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const listar = (quien: string, query = '') => request(app).get(`/api/v1/tickets${query}`).set(auth(quien));
  const detalle = (id: number, quien: string) => request(app).get(`/api/v1/tickets/${id}`).set(auth(quien));

  it('el vecino lista solo sus quejas, con las que están en espera primero, y el total es correcto', async () => {
    const vieja = await ticket({ creadoEn: '2026-10-01T15:00:00Z' });
    const reciente = await ticket({ creadoEn: '2026-10-20T15:00:00Z' });
    const enEspera = await ticket({ estado: 'en_espera', creadoEn: '2026-09-01T15:00:00Z' });
    await ticket({ solicitante: ids.otroVecino });

    const res = await listar('vecino');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, tamano: 20, total: 3 });
    expect(res.body.datos.map((t: { id: number }) => t.id)).toEqual([enEspera, reciente, vieja]);
    expect(res.body.datos[0]).toEqual({
      id: enEspera,
      numero: expect.stringMatching(/^Q-2026-\d{6}$/),
      titulo: 'Bache frente a la escuela',
      estado: 'en_espera',
      creadoEn: '2026-09-01T15:00:00.000Z',
      esperaRespuesta: true,
    });
    expect(res.body.datos[1].esperaRespuesta).toBe(false);
  });

  it('pagina el listado y rechaza un tamano mayor que 50 o un parámetro desconocido', async () => {
    await ticket();
    await ticket();
    await ticket();

    const segunda = await listar('vecino', '?pagina=2&tamano=2');
    expect(segunda.status).toBe(200);
    expect(segunda.body).toMatchObject({ pagina: 2, tamano: 2, total: 3 });
    expect(segunda.body.datos).toHaveLength(1);

    expect((await listar('vecino', '?tamano=51')).status).toBe(400);
    expect((await listar('vecino', '?estado=en_espera')).status).toBe(400);
  });

  it('el vecino abre una queja ajena → 404, igual que una inexistente', async () => {
    const ajena = await ticket({ solicitante: ids.otroVecino });

    const res = await detalle(ajena, 'vecino');
    const inexistente = await detalle(ajena + 1000, 'vecino');

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('NO_ENCONTRADO');
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('con dos pasos a en_espera, el detalle trae el motivo del último', async () => {
    const id = await ticket({ estado: 'en_espera' });
    await pasoAEspera(id, 'Envíe una foto del bache', '2026-10-21T10:00:00Z');
    await db('ticket_historial').insert({
      ticket_id: id,
      estado_anterior: 'en_espera',
      estado_nuevo: 'en_proceso',
      usuario_id: ids.vecino,
      creado_en: '2026-10-21T11:00:00Z',
    });
    await pasoAEspera(id, 'Envíe el número de contador', '2026-10-22T10:00:00Z');

    const res = await detalle(id, 'vecino');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-2026-\d{6}$/),
      estado: 'en_espera',
      titulo: 'Bache frente a la escuela',
      descripcion: 'Hay un bache profundo que daña los vehículos',
      categoria: { id: ids.baches, nombre: 'Baches' },
      zona: { id: ids.zona, nombre: 'Zona 1', tipo: 'zona' },
      direccion: '5a avenida 3-20, zona 1',
      dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
      creadoEn: '2026-10-20T15:00:00.000Z',
      resueltoEn: null,
      cerradoEn: null,
      informacionSolicitada: 'Envíe el número de contador',
      esSolicitante: true,
      resolucion: null,
    });
  });

  it('el detalle no incluye correo, teléfono, DPI, prioridad, técnico, coordenadas ni datos adicionales', async () => {
    const id = await ticket();

    const res = await detalle(id, 'supervisor');

    expect(res.status).toBe(200);
    expect(res.body.esSolicitante).toBe(false);
    const texto = JSON.stringify(res.body);
    for (const prohibido of ['@lectura.test', '55550000', '100000000000', 'urgente', 'Usuario tecnico', '14.63', '-90.5', 'profundidad']) {
      expect(texto).not.toContain(prohibido);
    }
    for (const campo of ['solicitante', 'solicitanteId', 'prioridad', 'tecnico', 'asignadoA', 'lat', 'lng', 'ubicacion', 'datosExtra']) {
      expect(res.body).not.toHaveProperty(campo);
    }
  });

  describe('resolución (SPEC 26)', () => {
    const SOLUCION = 'Se rellenó el bache con asfalto.\nSe señalizó la zona.';
    const resuelta = (estado: EstadoTicket = 'resuelta') =>
      ticket({ estado, resolucion: SOLUCION, resueltoPor: ids.tecnico });

    it('una queja en_proceso → resolucion: null', async () => {
      const id = await ticket();

      expect((await detalle(id, 'supervisor')).body.resolucion).toBeNull();
    });

    it.each(['tecnico', 'coordinador', 'supervisor'])(
      'una queja resuelta pedida por el %s trae la descripción, la fecha y quién resolvió',
      async (quien) => {
        const id = await resuelta();

        const res = await detalle(id, quien);

        expect(res.status).toBe(200);
        expect(res.body.resolucion).toEqual({
          descripcion: SOLUCION,
          resueltaEn: '2026-10-23T18:30:00.000Z',
          resueltaPor: { id: ids.tecnico, nombre: 'Usuario tecnico' },
        });
      },
    );

    it('la misma queja pedida por su vecino no dice quién resolvió ni expone datos de contacto', async () => {
      const id = await resuelta();

      const res = await detalle(id, 'vecino');

      expect(res.status).toBe(200);
      expect(res.body.resolucion).toEqual({
        descripcion: SOLUCION,
        resueltaEn: '2026-10-23T18:30:00.000Z',
        resueltaPor: null,
      });
      const texto = JSON.stringify(res.body);
      for (const prohibido of ['Usuario tecnico', '@lectura.test', '55550000', '100000000000']) {
        expect(texto).not.toContain(prohibido);
      }
    });

    it('una queja cerrada mantiene la resolución', async () => {
      const id = await resuelta('cerrada');

      const res = await detalle(id, 'vecino');

      expect(res.body).toMatchObject({ estado: 'cerrada', resolucion: { descripcion: SOLUCION, resueltaPor: null } });
    });

    it('con la columna llena en un estado que no es resuelta ni cerrada → resolucion: null', async () => {
      const id = await ticket({ estado: 'en_proceso', resolucion: SOLUCION, resueltoPor: ids.tecnico });

      expect((await detalle(id, 'supervisor')).body.resolucion).toBeNull();
    });
  });

  it('un técnico ve solo sus asignadas en el listado', async () => {
    const asignada = await ticket();
    await ticket({ asignadoA: null });

    const res = await listar('tecnico');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.datos.map((t: { id: number }) => t.id)).toEqual([asignada]);
  });

  it('el administrador ve todas', async () => {
    await ticket();
    await ticket({ solicitante: ids.otroVecino, asignadoA: null });

    const res = await listar('administrador');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('sin token → 401', async () => {
    const id = await ticket();

    expect((await request(app).get('/api/v1/tickets')).status).toBe(401);
    expect((await request(app).get(`/api/v1/tickets/${id}`)).status).toBe(401);
  });

  it('GET /:id no tapa las bandejas con ruta fija', async () => {
    expect((await listar('supervisor', '/triage')).status).toBe(200);
    expect((await listar('tecnico', '/atencion')).status).toBe(200);
    expect((await listar('supervisor', '/por-asignar')).status).toBe(200);
  });

  it('responder con POST /comentarios deja la queja en_proceso y sin informacionSolicitada', async () => {
    const id = await ticket({ estado: 'en_espera' });
    await pasoAEspera(id, 'Envíe el número de contador', '2026-10-22T10:00:00Z');

    const respuesta = await request(app)
      .post(`/api/v1/tickets/${id}/comentarios`)
      .set(auth('vecino'))
      .send({ cuerpo: 'El contador es 123456', interno: false });
    const res = await detalle(id, 'vecino');

    expect(respuesta.status).toBe(201);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'en_proceso', informacionSolicitada: null });
    const lista = await listar('vecino');
    expect(lista.body.datos[0]).toMatchObject({ id, estado: 'en_proceso', esperaRespuesta: false });
  });
});
