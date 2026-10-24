import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { Clock } from '../../src/domain/health/clock';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { cargarSlaDePrueba, createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

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

// La hora real, salvo cuando una prueba la fija para llegar al instante exacto del vencimiento.
class RelojAjustable implements Clock {
  fijo: Date | null = null;

  now(): Date {
    return this.fijo ? new Date(this.fijo) : new Date();
  }
}

const correosPendientes = () => new Promise((resolver) => setTimeout(resolver, 50));

describe('Confirmar o reabrir la solución (SPEC 27)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const enviador = new EnviadorEnMemoria();
  const reloj = new RelojAjustable();
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador, reloj });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);
    await cargarSlaDePrueba(db, [ids.baches]);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null, string | null][] = [
      ['vecino', 'vecino', null, 'vecino@confirmacion.test'],
      ['otroVecino', 'vecino', null, 'otro@confirmacion.test'],
      ['sinCorreo', 'vecino', null, null],
      ['tecnico', 'tecnico', ids.obras, 'tecnico@confirmacion.test'],
      ['coordinador', 'coordinador', ids.obras, 'coordinador@confirmacion.test'],
      ['coordinadorAgua', 'coordinador', ids.agua, 'agua@confirmacion.test'],
      ['supervisor', 'supervisor', null, 'supervisor@confirmacion.test'],
      ['receptor', 'receptor', null, 'receptor@confirmacion.test'],
      ['administrador', 'administrador', null, 'administrador@confirmacion.test'],
    ];
    for (const [clave, rol, dependenciaId, email] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email,
          telefono: '55558888',
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      if (email) {
        const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
        tokens[clave] = res.body.accessToken;
      }
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

  beforeEach(() => {
    reloj.fijo = null;
    enviador.fallar = false;
    enviador.enviados.length = 0;
  });

  interface OpcionesTicket {
    estado?: EstadoTicket;
    solicitante?: number;
    venceEn?: Date | null;
    reaperturas?: number;
  }

  // Una queja de Obras resuelta por el técnico, con 3 días para confirmar.
  async function ticket({
    estado = 'resuelta',
    solicitante = ids.vecino,
    venceEn = new Date(Date.now() + 3 * 86_400_000),
    reaperturas = 0,
  }: OpcionesTicket = {}): Promise<number> {
    const resuelta = estado === 'resuelta';
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitante,
        registrado_por: solicitante,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: 'media',
        asignado_a: ids.tecnico,
        resuelto_en: resuelta ? new Date() : null,
        resolucion: resuelta ? 'Se rellenó el bache' : null,
        resuelto_por: resuelta ? ids.tecnico : null,
        confirmacion_vence_en: resuelta ? venceEn : null,
        reaperturas,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const transicion = (id: number, cuerpo: object, quien = 'vecino') =>
    request(app).post(`/api/v1/tickets/${id}/transiciones`).set(auth(quien)).send(cuerpo);
  const confirmar = (id: number, quien = 'vecino', motivo?: string) =>
    transicion(id, motivo === undefined ? { accion: 'confirmar' } : { accion: 'confirmar', motivo }, quien);
  const reabrir = (id: number, quien = 'vecino', motivo = 'Sigue el bache') =>
    transicion(id, { accion: 'reabrir', motivo }, quien);
  const historial = (id: number) =>
    db('ticket_historial').where({ ticket_id: id }).orderBy('id').select('estado_anterior', 'estado_nuevo', 'usuario_id', 'motivo');
  const fila = (id: number) =>
    db('tickets')
      .where({ id })
      .first(
        'estado',
        'asignado_a',
        'cerrado_en',
        'resuelto_en',
        'resolucion',
        'resuelto_por',
        'confirmacion_vence_en',
        'reaperturas',
      );

  it('el vecino confirma su queja → 200, cerrada, cerrado_en, una fila de historial y el correo queja_cerrada', async () => {
    const id = await ticket();

    const res = await confirmar(id);
    await correosPendientes();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-2026-/),
      estado: 'cerrada',
      asignadoA: ids.tecnico,
      resueltoEn: expect.stringMatching(/Z$/),
      cerradoEn: expect.stringMatching(/Z$/),
      reaperturas: 0,
    });
    expect((await fila(id)).cerrado_en).toBeInstanceOf(Date);
    expect(await historial(id)).toEqual([
      { estado_anterior: 'resuelta', estado_nuevo: 'cerrada', usuario_id: String(ids.vecino), motivo: null },
    ]);
    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0]).toMatchObject({ para: 'vecino@confirmacion.test' });
    expect(enviador.enviados[0].asunto).toContain('fue cerrada');
  });

  it('el vecino reabre con motivo → 200, en_proceso con el mismo técnico, una reapertura, sin plazo ni resolución, y queja_reabierta', async () => {
    const id = await ticket();

    const res = await reabrir(id, 'vecino', '  El bache volvió a abrirse  ');
    await correosPendientes();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'en_proceso', asignadoA: ids.tecnico, resueltoEn: null, reaperturas: 1 });
    expect(await fila(id)).toMatchObject({
      estado: 'en_proceso',
      asignado_a: String(ids.tecnico),
      resuelto_en: null,
      resolucion: null,
      resuelto_por: null,
      confirmacion_vence_en: null,
      reaperturas: 1,
    });
    expect((await historial(id)).at(-1)).toEqual({
      estado_anterior: 'resuelta',
      estado_nuevo: 'en_proceso',
      usuario_id: String(ids.vecino),
      motivo: 'El bache volvió a abrirse',
    });
    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0].asunto).toContain('reabrimos tu queja');
    expect(enviador.enviados[0].texto).toContain('El bache volvió a abrirse');
  });

  it('el vecino de otra queja → 404', async () => {
    const id = await ticket({ solicitante: ids.otroVecino });

    const res = await confirmar(id);

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('el coordinador de la dependencia confirma: sin motivo → 400 MOTIVO_REQUERIDO, con motivo → 200; el de otra → 404', async () => {
    const id = await ticket();

    const sinMotivo = await confirmar(id, 'coordinador');
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.codigo).toBe('MOTIVO_REQUERIDO');
    expect((await confirmar(id, 'coordinadorAgua', 'Confirmó por teléfono')).status).toBe(404);

    const res = await confirmar(id, 'coordinador', 'El vecino confirmó por teléfono');
    expect(res.status).toBe(200);
    expect((await historial(id)).at(-1)).toMatchObject({
      usuario_id: String(ids.coordinador),
      motivo: 'El vecino confirmó por teléfono',
    });
  });

  it('el supervisor reabre cualquiera → 200', async () => {
    const id = await ticket({ solicitante: ids.otroVecino });

    expect((await reabrir(id, 'supervisor')).status).toBe(200);
  });

  it.each(['tecnico', 'receptor', 'administrador'])('el %s recibe 403 en confirmar y reabrir', async (quien) => {
    const id = await ticket();

    for (const res of [await confirmar(id, quien, 'motivo'), await reabrir(id, quien)]) {
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('PERMISO_DENEGADO');
    }
    expect((await fila(id)).estado).toBe('resuelta');
  });

  it.each([
    ['sin motivo', { accion: 'reabrir' }],
    ['con motivo en blanco', { accion: 'reabrir', motivo: '   ' }],
  ])('reabrir %s → 400 MOTIVO_REQUERIDO', async (_caso, cuerpo) => {
    const id = await ticket();

    const res = await transicion(id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('MOTIVO_REQUERIDO');
  });

  it('un motivo de 1001 caracteres → 400 VALIDACION', async () => {
    const id = await ticket();

    expect((await reabrir(id, 'vecino', 'a'.repeat(1001))).body.codigo).toBe('VALIDACION');
  });

  it('confirmar una queja en en_proceso → 409 TRANSICION_INVALIDA', async () => {
    const id = await ticket({ estado: 'en_proceso' });

    const res = await confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('con el plazo vencido → 409 PLAZO_CONFIRMACION_VENCIDO; en el instante exacto → 200', async () => {
    // Cerca de la hora real: el reloj también valida la sesión, así el token sigue vigente.
    const vence = new Date(Date.now() + 60_000);
    const vencida = await ticket({ venceEn: vence });
    const enElLimite = await ticket({ venceEn: vence });

    reloj.fijo = new Date(vence.getTime() + 1);
    for (const res of [await confirmar(vencida), await reabrir(vencida)]) {
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('PLAZO_CONFIRMACION_VENCIDO');
    }

    reloj.fijo = vence;
    expect((await confirmar(enElLimite)).status).toBe(200);
  });

  it('después de 2 reaperturas, una tercera → 409 LIMITE_REAPERTURAS, también para el supervisor', async () => {
    const id = await ticket();
    expect((await reabrir(id)).status).toBe(200);
    await db('tickets')
      .where({ id })
      .update({ estado: 'resuelta', resuelto_en: new Date(), confirmacion_vence_en: new Date(Date.now() + 86_400_000) });
    expect((await reabrir(id)).status).toBe(200);
    await db('tickets')
      .where({ id })
      .update({ estado: 'resuelta', resuelto_en: new Date(), confirmacion_vence_en: new Date(Date.now() + 86_400_000) });

    for (const quien of ['vecino', 'supervisor']) {
      const res = await reabrir(id, quien);
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('LIMITE_REAPERTURAS');
    }
    expect((await fila(id)).reaperturas).toBe(2);
    // Confirmar sigue funcionando.
    expect((await confirmar(id)).status).toBe(200);
  });

  it('sin vencimiento guardado → 409 PLAZO_NO_DEFINIDO', async () => {
    const id = await ticket({ venceEn: null });

    const res = await confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('PLAZO_NO_DEFINIDO');
  });

  it('un fallo del enviador no cambia el 200', async () => {
    enviador.fallar = true;
    const id = await ticket();

    expect((await confirmar(id)).status).toBe(200);
    await correosPendientes();
    expect((await fila(id)).estado).toBe('cerrada');
  });

  it('un vecino sin correo no recibe nada', async () => {
    const id = await ticket({ solicitante: ids.sinCorreo });

    expect((await reabrir(id, 'supervisor')).status).toBe(200);
    await correosPendientes();
    expect(enviador.enviados).toEqual([]);
  });

  it('dos acciones simultáneas: una → 200 y la otra → 409, con una sola transición', async () => {
    const id = await ticket();

    const respuestas = await Promise.all([confirmar(id), reabrir(id)]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(respuestas.find((r) => r.status === 409)!.body.codigo).toBe('TRANSICION_INVALIDA');
    expect(await historial(id)).toHaveLength(1);
  });
});
