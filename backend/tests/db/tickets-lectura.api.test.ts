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
    // Otra dependencia y otra categoría para los filtros del listado interno (SPEC 45).
    const [agua] = await db('dependencias').insert({ nombre: 'Agua Potable' }).returning('id');
    ids.agua = Number(agua.id);
    const [fugas] = await db('categorias').insert({ nombre: 'Fugas', dependencia_id: ids.agua }).returning('id');
    ids.fugas = Number(fugas.id);
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
    await db('encuestas').del(); // apunta a tickets (SPEC 39)
    await db('comentarios').del();
    await db('ticket_historial').del();
    await db('correos_salientes').delete(); // apunta a usuarios y tickets (SPEC 34)
    await db('tickets').del();
  });

  interface OpcionesTicket {
    titulo?: string;
    estado?: EstadoTicket;
    solicitante?: number;
    asignadoA?: number | null;
    creadoEn?: string;
    resolucion?: string | null;
    resueltoPor?: number | null;
    venceEn?: Date | null;
    reaperturas?: number;
    categoria?: number; // SPEC 45
    dependencia?: number | null;
    prioridad?: string | null;
    escalado?: boolean;
  }

  // Una queja en Obras, registrada por el receptor, con coordenadas y prioridad para comprobar que no se exponen.
  async function ticket({
    titulo = 'Bache frente a la escuela',
    estado = 'en_proceso',
    solicitante = ids.vecino,
    asignadoA = ids.tecnico,
    creadoEn = '2026-10-20T15:00:00Z',
    resolucion = null,
    resueltoPor = null,
    venceEn = null,
    reaperturas = 0,
    categoria = ids.baches,
    dependencia = ids.obras,
    prioridad = 'urgente',
    escalado = false,
  }: OpcionesTicket = {}): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitante,
        registrado_por: ids.receptor,
        categoria_id: categoria,
        dependencia_id: dependencia,
        zona_id: ids.zona,
        canal: 'telefono',
        titulo,
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad,
        escalado,
        escalado_en: escalado ? '2026-10-21T15:00:00Z' : null,
        escalado_por: escalado ? 'respuesta' : null,
        asignado_a: asignadoA,
        lat: 14.634915,
        lng: -90.506882,
        datos_extra: { profundidad: 30 },
        creado_en: creadoEn,
        resolucion,
        resuelto_por: resueltoPor,
        resuelto_en: resolucion === null ? null : '2026-10-23T18:30:00Z',
        cerrado_en: estado === 'cerrada' ? '2026-10-25T18:30:00Z' : null,
        confirmacion_vence_en: venceEn,
        reaperturas,
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
      confirmacionVenceEn: null, // SPEC 38
      pendienteCalificar: false, // SPEC 39
      interno: null, // el vecino no ve los datos internos (SPEC 45)
    });
    expect(res.body.datos[1].esperaRespuesta).toBe(false);
  });

  describe('filtros, orden y resumen (SPEC 38)', () => {
    const DIA = 24 * 60 * 60 * 1000;
    const idsDe = (res: { body: { datos: { id: number }[] } }) => res.body.datos.map((t) => t.id);
    const numeroDe = async (id: number) => (await db('tickets').where({ id }).first('numero')).numero as string;

    it('estado filtra por uno o varios estados', async () => {
      const espera = await ticket({ estado: 'en_espera' });
      const proceso = await ticket({ estado: 'en_proceso' });
      await ticket({ estado: 'cerrada' });

      expect(idsDe(await listar('vecino', '?estado=en_espera'))).toEqual([espera]);
      expect(idsDe(await listar('vecino', '?estado=en_espera&estado=en_proceso')).sort()).toEqual([espera, proceso].sort());
    });

    it.each([
      ['un estado desconocido', '?estado=perdida'],
      ['un estado repetido', '?estado=nueva&estado=nueva'],
      ['un q de 1 carácter', '?q=a'],
      ['un q de 101 caracteres', `?q=${'a'.repeat(101)}`],
    ])('%s → 400 VALIDACION', async (_caso, query) => {
      const res = await listar('vecino', query);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });

    it('q con un número completo lo busca exacto, sin distinguir mayúsculas', async () => {
      const buscada = await ticket();
      await ticket();
      const numero = await numeroDe(buscada);

      expect(idsDe(await listar('vecino', `?q=${numero.toLowerCase()}`))).toEqual([buscada]);
    });

    it('q busca en el título sin distinguir mayúsculas, y % y _ no son comodines', async () => {
      const bache = await ticket({ titulo: 'Bache en la 5a avenida' });
      const porcentaje = await ticket({ titulo: 'Subió el 50% la fuga' });
      await ticket({ titulo: 'Lámpara apagada' });

      expect(idsDe(await listar('vecino', '?q=BACHE'))).toEqual([bache]);
      expect(idsDe(await listar('vecino', `?q=${encodeURIComponent('50%')}`))).toEqual([porcentaje]);
      expect(idsDe(await listar('vecino', '?q=l_mpara'))).toEqual([]);
    });

    it('ordena: en espera, después resueltas con plazo vigente, después el resto por fecha', async () => {
      const ahora = Date.now();
      const vieja = await ticket({ creadoEn: '2026-01-01T15:00:00Z' });
      const vencida = await ticket({ estado: 'resuelta', creadoEn: '2026-10-25T15:00:00Z', venceEn: new Date(ahora - DIA) });
      const vigente = await ticket({ estado: 'resuelta', creadoEn: '2026-02-01T15:00:00Z', venceEn: new Date(ahora + DIA) });
      const espera = await ticket({ estado: 'en_espera', creadoEn: '2025-12-01T15:00:00Z' });

      const res = await listar('vecino');

      expect(idsDe(res)).toEqual([espera, vigente, vencida, vieja]);
      const porId = Object.fromEntries(res.body.datos.map((t: { id: number; confirmacionVenceEn: string | null }) => [t.id, t.confirmacionVenceEn]));
      expect(porId[vigente]).toEqual(expect.any(String));
      expect(porId[vencida]).toEqual(expect.any(String));
      expect(porId[espera]).toBeNull();
    });

    it('confirmacionVenceEn solo viene en resuelta', async () => {
      const cerrada = await ticket({ estado: 'cerrada', venceEn: new Date(Date.now() + DIA) });
      expect((await listar('vecino')).body.datos.find((t: { id: number }) => t.id === cerrada).confirmacionVenceEn).toBeNull();
    });

    it('el vecino nunca ve quejas de otro vecino, aunque busque su número', async () => {
      const ajena = await ticket({ solicitante: ids.otroVecino });

      expect((await listar('vecino', `?q=${await numeroDe(ajena)}`)).body).toMatchObject({ datos: [], total: 0 });
    });

    const resumen = (quien: string, query = '') => request(app).get(`/api/v1/tickets/resumen${query}`).set(auth(quien));

    it('el resumen trae los 8 estados con 0 donde no hay, y el total; con q cuenta solo las coincidencias', async () => {
      await ticket({ estado: 'en_espera', titulo: 'Bache grande' });
      await ticket({ estado: 'en_espera', titulo: 'Fuga de agua' });
      await ticket({ estado: 'cerrada', titulo: 'Bache chico' });
      await ticket({ estado: 'cerrada', solicitante: ids.otroVecino });

      const todo = await resumen('vecino');
      expect(todo.status).toBe(200);
      expect(todo.body).toEqual({
        porEstado: { nueva: 0, en_revision: 0, asignada: 0, en_proceso: 0, en_espera: 2, resuelta: 0, cerrada: 1, rechazada: 0 },
        total: 3,
      });
      expect((await resumen('vecino', '?q=bache')).body).toMatchObject({ porEstado: { en_espera: 1, cerrada: 1 }, total: 2 });
      expect((await resumen('vecino', '?estado=cerrada')).status).toBe(400);
    });

    it('un técnico cuenta solo sus asignadas; sin sesión → 401', async () => {
      await ticket({ asignadoA: ids.tecnico });
      await ticket({ asignadoA: null });

      expect((await resumen('tecnico')).body.total).toBe(1);
      expect((await request(app).get('/api/v1/tickets/resumen')).status).toBe(401);
    });
  });

  describe('filtros del listado interno (SPEC 45)', () => {
    const idsDe = (res: { body: { datos: { id: number }[] } }) => res.body.datos.map((t) => t.id).sort((a, b) => a - b);
    const resumenDe = (quien: string, query = '') => request(app).get(`/api/v1/tickets/resumen${query}`).set(auth(quien));

    it('cada filtro reduce el resultado, y combinados se intersectan', async () => {
      const urgenteObras = await ticket();
      const altaObras = await ticket({ prioridad: 'alta' });
      const fugaAgua = await ticket({ categoria: ids.fugas, dependencia: ids.agua, prioridad: 'alta' });
      const escalada = await ticket({ escalado: true });
      const enRevision = await ticket({ estado: 'en_revision', dependencia: null, prioridad: null, asignadoA: null });

      expect(idsDe(await listar('supervisor', `?dependenciaId=${ids.agua}`))).toEqual([fugaAgua]);
      expect(idsDe(await listar('supervisor', `?categoriaId=${ids.baches}`))).toEqual([urgenteObras, altaObras, escalada, enRevision]);
      expect(idsDe(await listar('supervisor', '?prioridad=alta'))).toEqual([altaObras, fugaAgua]);
      expect(idsDe(await listar('supervisor', '?escalado=true'))).toEqual([escalada]);
      expect(idsDe(await listar('supervisor', `?prioridad=alta&dependenciaId=${ids.obras}`))).toEqual([altaObras]);
      // Una queja sin dependencia ni prioridad no coincide con esos filtros.
      expect(idsDe(await listar('supervisor', `?dependenciaId=${ids.obras}&prioridad=urgente`))).toEqual([urgenteObras, escalada]);
    });

    it('un coordinador que pide otra dependencia recibe una lista vacía, no un error', async () => {
      await ticket({ categoria: ids.fugas, dependencia: ids.agua });
      await ticket();

      const res = await listar('coordinador', `?dependenciaId=${ids.agua}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ datos: [], total: 0 });
      expect((await resumenDe('coordinador', `?dependenciaId=${ids.agua}`)).body.total).toBe(0);
    });

    it('el rango toma días completos en Guatemala, ambos inclusive', async () => {
      const ultimaHora = await ticket({ creadoEn: '2026-10-02T05:30:00Z' }); // 1 de octubre, 23:30 en Guatemala
      await ticket({ creadoEn: '2026-10-02T06:10:00Z' }); // 2 de octubre, 00:10 en Guatemala
      await ticket({ creadoEn: '2026-09-30T23:00:00Z' }); // 30 de septiembre, 17:00 en Guatemala

      expect(idsDe(await listar('supervisor', '?desde=2026-10-01&hasta=2026-10-01'))).toEqual([ultimaHora]);
    });

    it('un rango inválido → 400 RANGO_INVALIDO; prioridad desconocida o escalado=false → 400 VALIDACION', async () => {
      expect((await listar('supervisor', '?desde=2025-01-01&hasta=2026-01-02')).body.codigo).toBe('RANGO_INVALIDO');
      expect((await listar('supervisor', '?desde=2026-10-05&hasta=2026-10-01')).body.codigo).toBe('RANGO_INVALIDO');
      expect((await resumenDe('supervisor', '?desde=2026-13-01')).body.codigo).toBe('RANGO_INVALIDO');
      for (const query of ['?prioridad=maxima', '?escalado=false', '?dependenciaId=0', '?categoriaId=x']) {
        const res = await listar('supervisor', query);
        expect(res.status).toBe(400);
        expect(res.body.codigo).toBe('VALIDACION');
      }
    });

    it('el supervisor recibe interno y el orden de las más recientes, sin datos del solicitante', async () => {
      const vieja = await ticket({ creadoEn: '2026-10-01T15:00:00Z' });
      const enEspera = await ticket({ estado: 'en_espera', creadoEn: '2026-09-01T15:00:00Z' });
      const nueva = await ticket({
        estado: 'nueva',
        dependencia: null,
        prioridad: null,
        asignadoA: null,
        creadoEn: '2026-10-22T15:00:00Z',
      });
      const escalada = await ticket({ escalado: true, creadoEn: '2026-10-21T15:00:00Z' });

      const res = await listar('supervisor');

      expect(res.status).toBe(200);
      // Sin "en espera primero": solo creado_en DESC (SPEC 45).
      expect(res.body.datos.map((t: { id: number }) => t.id)).toEqual([nueva, escalada, vieja, enEspera]);
      const [enNueva, enEscalada, enVieja] = res.body.datos;
      expect(enVieja.interno).toEqual({
        prioridad: 'urgente',
        categoria: { id: ids.baches, nombre: 'Baches' },
        dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
        tecnico: { id: ids.tecnico, nombre: 'Usuario tecnico' },
        sla: {
          venceRespuesta: null,
          primeraRespuestaEn: null,
          venceResolucion: null,
          pausado: false,
          restanteMinutosEnPausa: null,
          escalado: false,
          escaladoEn: null,
          escaladoPor: null,
        },
      });
      expect(enNueva.interno).toMatchObject({ prioridad: null, dependencia: null, tecnico: null });
      expect(enEscalada.interno.sla).toMatchObject({ escalado: true, escaladoPor: 'respuesta' });
      const texto = JSON.stringify(res.body);
      for (const dato of ['Usuario vecino', 'vecino@lectura.test', '55550000', '1000000000000']) {
        expect(texto).not.toContain(dato);
      }
    });

    it('el vecino conserva el orden de SPEC 38 e interno: null', async () => {
      await ticket({ creadoEn: '2026-10-01T15:00:00Z' });
      const enEspera = await ticket({ estado: 'en_espera', creadoEn: '2026-09-01T15:00:00Z' });

      const res = await listar('vecino');

      expect(res.body.datos[0].id).toBe(enEspera);
      expect(res.body.datos.every((t: { interno: unknown }) => t.interno === null)).toBe(true);
    });

    it('el resumen con categoriaId cuenta solo esa categoría y coincide con el listado', async () => {
      await ticket({ estado: 'en_proceso' });
      await ticket({ estado: 'asignada' });
      await ticket({ estado: 'asignada', categoria: ids.fugas, dependencia: ids.agua });

      const res = await resumenDe('supervisor', `?categoriaId=${ids.baches}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 2, porEstado: { en_proceso: 1, asignada: 1 } });
      expect((await listar('supervisor', `?categoriaId=${ids.baches}`)).body.total).toBe(2);
    });
  });

  describe('encuesta (SPEC 39)', () => {
    const DIA = 24 * 60 * 60 * 1000;
    async function cerrada(haceDias = 2): Promise<number> {
      const id = await ticket({ estado: 'cerrada', resolucion: 'Se rellenó', resueltoPor: ids.tecnico });
      await db('tickets').where({ id }).update({ cerrado_en: new Date(Date.now() - haceDias * DIA) });
      return id;
    }
    const pendiente = async (id: number) =>
      (await listar('vecino')).body.datos.find((t: { id: number }) => t.id === id).pendienteCalificar;

    it('el solicitante de una cerrada sin encuesta puede calificar, con la fecha límite', async () => {
      const id = await cerrada();

      const res = await detalle(id, 'vecino');

      expect(res.body).toMatchObject({ encuesta: null, puedeCalificar: true, encuestaVenceEn: expect.any(String) });
      const vence = new Date(res.body.encuestaVenceEn).getTime();
      const cerradoEn = new Date(res.body.cerradoEn).getTime();
      expect(vence - cerradoEn).toBe(30 * DIA);
      expect(await pendiente(id)).toBe(true);
    });

    it('después de calificar ya no puede, y la encuesta la ven él y el coordinador', async () => {
      const id = await cerrada();
      const calificacion = await request(app)
        .post(`/api/v1/tickets/${id}/encuesta`)
        .set(auth('vecino'))
        .send({ calificacion: 4, comentario: 'Bien' });
      expect(calificacion.status).toBe(201);

      const delVecino = await detalle(id, 'vecino');
      expect(delVecino.body).toMatchObject({
        encuesta: { calificacion: 4, comentario: 'Bien', creadoEn: expect.any(String) },
        puedeCalificar: false,
        encuestaVenceEn: null,
      });
      expect(await pendiente(id)).toBe(false);
      expect((await detalle(id, 'coordinador')).body).toMatchObject({ encuesta: { calificacion: 4 }, puedeCalificar: false });
    });

    it('el coordinador de una cerrada sin encuesta no puede calificar', async () => {
      const id = await cerrada();
      expect((await detalle(id, 'coordinador')).body).toMatchObject({ encuesta: null, puedeCalificar: false, encuestaVenceEn: null });
    });

    it('fuera de plazo, puedeCalificar y pendienteCalificar son false', async () => {
      const id = await cerrada(31);
      expect((await detalle(id, 'vecino')).body.puedeCalificar).toBe(false);
      expect(await pendiente(id)).toBe(false);
    });
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
    // Desde SPEC 38 y 45, estado, q y los filtros del listado interno son válidos; cualquier otro sigue siendo 400.
    expect((await listar('vecino', '?zonaId=1')).status).toBe(400);
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
      cierreAutomatico: false,
      esSolicitante: true,
      resolucion: null,
      confirmacion: null,
      sla: null, // el vecino no ve los vencimientos (SPEC 30)
      encuesta: null, // SPEC 39
      puedeCalificar: false,
      encuestaVenceEn: null,
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

  describe('confirmación (SPEC 27)', () => {
    const resuelta = (venceEn: Date, reaperturas = 0) =>
      ticket({ estado: 'resuelta', resolucion: 'Se rellenó el bache', resueltoPor: ids.tecnico, venceEn, reaperturas });
    const enUnDia = () => new Date(Date.now() + 86_400_000);

    it('una queja en resuelta pedida por su vecino puede confirmarse y reabrirse, sin motivo al confirmar', async () => {
      const vence = enUnDia();
      const id = await resuelta(vence);

      const res = await detalle(id, 'vecino');

      expect(res.status).toBe(200);
      expect(res.body.confirmacion).toEqual({
        venceEn: vence.toISOString(),
        vencida: false,
        reaperturasRestantes: 2,
        puedeConfirmar: true,
        puedeReabrir: true,
        exigeMotivoAlConfirmar: false,
      });
    });

    it('pedida por el técnico, ve el plazo pero no puede confirmar ni reabrir', async () => {
      const id = await resuelta(enUnDia());

      expect((await detalle(id, 'tecnico')).body.confirmacion).toMatchObject({
        vencida: false,
        puedeConfirmar: false,
        puedeReabrir: false,
      });
    });

    it('el coordinador puede, con motivo obligatorio al confirmar', async () => {
      const id = await resuelta(enUnDia());

      expect((await detalle(id, 'coordinador')).body.confirmacion).toMatchObject({
        puedeConfirmar: true,
        puedeReabrir: true,
        exigeMotivoAlConfirmar: true,
      });
    });

    it('con el plazo vencido → vencida: true y ninguna acción', async () => {
      const id = await resuelta(new Date(Date.now() - 1000));

      expect((await detalle(id, 'vecino')).body.confirmacion).toMatchObject({
        vencida: true,
        puedeConfirmar: false,
        puedeReabrir: false,
      });
    });

    it('en el límite de reaperturas → puedeReabrir: false y reaperturasRestantes: 0', async () => {
      const id = await resuelta(enUnDia(), 2);

      expect((await detalle(id, 'vecino')).body.confirmacion).toMatchObject({
        reaperturasRestantes: 0,
        puedeConfirmar: true,
        puedeReabrir: false,
      });
    });

    it('en otro estado → confirmacion: null', async () => {
      const cerrada = await ticket({ estado: 'cerrada', resolucion: 'x', resueltoPor: ids.tecnico, venceEn: enUnDia() });
      const enProceso = await ticket();

      expect((await detalle(cerrada, 'vecino')).body.confirmacion).toBeNull();
      expect((await detalle(enProceso, 'vecino')).body.confirmacion).toBeNull();
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

  describe('cierreAutomatico (SPEC 33)', () => {
    async function cierre(id: number, usuarioId: number | null) {
      await db('ticket_historial').insert({
        ticket_id: id,
        estado_anterior: 'resuelta',
        estado_nuevo: 'cerrada',
        usuario_id: usuarioId,
        motivo: null,
        creado_en: '2026-10-25T18:30:00Z',
      });
    }

    const resuelta = { resolucion: 'Se rellenó el bache', resueltoPor: null as number | null };

    it('una queja cerrada por el job devuelve true', async () => {
      const id = await ticket({ estado: 'cerrada', ...resuelta, resueltoPor: ids.tecnico });
      await cierre(id, null);
      expect((await detalle(id, 'vecino')).body.cierreAutomatico).toBe(true);
    });

    it('una queja confirmada por el vecino devuelve false', async () => {
      const id = await ticket({ estado: 'cerrada', ...resuelta, resueltoPor: ids.tecnico });
      await cierre(id, ids.vecino);
      expect((await detalle(id, 'vecino')).body.cierreAutomatico).toBe(false);
    });

    it('una queja en otro estado devuelve false', async () => {
      const id = await ticket({ estado: 'en_proceso' });
      expect((await detalle(id, 'vecino')).body.cierreAutomatico).toBe(false);
    });
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
