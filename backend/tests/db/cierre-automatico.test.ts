import path from 'node:path';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');
const PASSWORD_DESARROLLO = 'Desarrollo2026';

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

// El job recibe su `ahora`; las acciones del vecino usan el reloj real de la app. Así un plazo puede estar vencido
// para el job y vigente para el vecino a la vez (la carrera del paso 3).
const REAL = Date.now();
const HORA = 3_600_000;
const AHORA = new Date(REAL + 2 * HORA);
const VENCIO = new Date(AHORA.getTime() - HORA);

describe('Cierre automático (SPEC 33)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const correos = new EnviadorEnMemoria();
  const ids: Record<string, number> = {};
  let correlativo = 1;

  async function ticket(estado: EstadoTicket, confirmacionVenceEn: Date | null = VENCIO): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
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
        resuelto_en: estado === 'resuelta' ? new Date(REAL - 24 * HORA) : null,
        resuelto_por: estado === 'resuelta' ? ids.tecnico : null,
        resolucion: estado === 'resuelta' ? 'Se rellenó el bache' : null,
        confirmacion_vence_en: confirmacionVenceEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  const estado = (id: number) => db('tickets').where({ id }).first('estado', 'cerrado_en');
  const cierres = (id: number) =>
    db('ticket_historial').where({ ticket_id: id, estado_nuevo: 'cerrada' }).select('estado_anterior', 'usuario_id', 'motivo');
  const correosPendientes = async (cantidad = 1) => {
    for (let intento = 0; intento < 40 && correos.enviados.length < cantidad; intento++) {
      await new Promise((resolver) => setTimeout(resolver, 25));
    }
  };

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: correos });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();
    await db.seed.run({ directory: seedsDesarrolloDir });
    for (const rol of ['vecino', 'tecnico']) {
      ids[rol] = Number((await db('usuarios').where({ email: `${rol}@vozmuni.test` }).first('id')).id);
    }
    ids.obras = Number((await db('dependencias').where({ nombre: 'Dirección de Obras' }).first('id')).id);
    ids.baches = Number((await db('categorias').where({ nombre: 'Baches' }).first('id')).id);
    ids.zona = Number((await db('zonas').first('id')).id);
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
    correos.enviados.length = 0;
    correos.fallar = false;
    // Lo que dejó pendiente una prueba anterior no cuenta en la siguiente.
    await db('tickets').where({ estado: 'resuelta' }).update({ estado: 'cerrada', cerrado_en: new Date(REAL) });
  });

  it('una resuelta vencida queda cerrada, con cerrado_en, historial del sistema y el correo', async () => {
    const id = await ticket('resuelta');
    expect(await container.cierreAutomaticoService.procesar(AHORA)).toBe(1);
    expect(await estado(id)).toEqual({ estado: 'cerrada', cerrado_en: AHORA });
    expect(await cierres(id)).toEqual([{ estado_anterior: 'resuelta', usuario_id: null, motivo: null }]);

    await correosPendientes();
    expect(correos.enviados).toHaveLength(1);
    expect(correos.enviados[0]).toMatchObject({ para: 'vecino@vozmuni.test' });
    expect(correos.enviados[0].asunto).toMatch(/^VozMuni: cerramos tu queja Q-2026-\d{6}$/);
    expect(correos.enviados[0].texto).toContain(`http://localhost:5173/tickets/${id}`);
  });

  it('con confirmacion_vence_en = ahora no se cierra: el instante exacto sigue vigente', async () => {
    const id = await ticket('resuelta', AHORA);
    expect(await container.cierreAutomaticoService.procesar(AHORA)).toBe(0);
    expect(await estado(id)).toMatchObject({ estado: 'resuelta' });
  });

  it.each<EstadoTicket>(['en_proceso', 'en_espera', 'cerrada'])('una queja en %s no se cierra', async (otro) => {
    const id = await ticket(otro);
    await container.cierreAutomaticoService.procesar(AHORA);
    expect(await cierres(id)).toEqual([]);
  });

  it('una resuelta sin confirmacion_vence_en no se cierra y aparece en el aviso del log', async () => {
    const id = await ticket('resuelta', null);
    const aviso = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await container.cierreAutomaticoService.procesar(AHORA)).toBe(0);
      expect(await estado(id)).toMatchObject({ estado: 'resuelta' });
      expect(aviso).toHaveBeenCalledWith('Cierre automático: 1 quejas resueltas sin plazo de confirmación no se cierran');
    } finally {
      aviso.mockRestore();
      await db('tickets').where({ id }).update({ estado: 'cerrada', cerrado_en: new Date(REAL) });
    }
  });

  it('una segunda corrida no cierra ni envía nada nuevo', async () => {
    const id = await ticket('resuelta');
    await container.cierreAutomaticoService.procesar(AHORA);
    await correosPendientes();
    expect(await container.cierreAutomaticoService.procesar(new Date(AHORA.getTime() + 60_000))).toBe(0);
    await new Promise((resolver) => setTimeout(resolver, 200));
    expect(await cierres(id)).toHaveLength(1);
    expect(correos.enviados).toHaveLength(1);
  });

  it('dos procesar simultáneos cierran cada queja una sola vez', async () => {
    const creadas = await Promise.all(Array.from({ length: 20 }, () => ticket('resuelta')));
    const [a, b] = await Promise.all([
      container.cierreAutomaticoService.procesar(AHORA),
      container.cierreAutomaticoService.procesar(AHORA),
    ]);
    expect(a + b).toBe(20);
    const [{ total }] = await db('ticket_historial')
      .whereIn('ticket_id', creadas)
      .where({ estado_nuevo: 'cerrada' })
      .count({ total: '*' });
    expect(Number(total)).toBe(20);
  });

  it('si el vecino confirma la misma queja, una de las dos acciones gana y la otra no aplica cambios', async () => {
    const id = await ticket('resuelta');
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'vecino@vozmuni.test', password: PASSWORD_DESARROLLO });
    const [cerradas, confirmacion] = await Promise.all([
      container.cierreAutomaticoService.procesar(AHORA),
      request(app)
        .post(`/api/v1/tickets/${id}/transiciones`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ accion: 'confirmar' }),
    ]);
    // O cerró el job (y el vecino recibe 409), o confirmó el vecino (y el job no cerró nada).
    if (cerradas === 1) {
      expect(confirmacion.status).toBe(409);
    } else {
      expect(cerradas).toBe(0);
      expect(confirmacion.status).toBe(200);
    }
    expect(await estado(id)).toMatchObject({ estado: 'cerrada' });
    const historial = await cierres(id);
    expect(historial).toHaveLength(1);
    expect(historial[0].usuario_id).toBe(cerradas === 1 ? null : String(ids.vecino));
  });

  it('más de 200 vencidas se cierran en varios lotes', async () => {
    const filas = Array.from({ length: 205 }, () => ({
      numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
      solicitante_id: ids.vecino,
      registrado_por: ids.vecino,
      categoria_id: ids.baches,
      dependencia_id: ids.obras,
      zona_id: ids.zona,
      canal: 'portal',
      titulo: 'Bache',
      descripcion: 'Hay un bache profundo',
      direccion: 'Calle 1',
      estado: 'resuelta',
      prioridad: 'alta',
      resuelto_en: new Date(REAL - 24 * HORA),
      confirmacion_vence_en: VENCIO,
    }));
    await db.batchInsert('tickets', filas, 100);
    expect(await container.cierreAutomaticoService.procesar(AHORA)).toBe(205);
    const [{ total }] = await db('tickets').where({ estado: 'resuelta' }).count({ total: '*' });
    expect(Number(total)).toBe(0);
  });

  it('un fallo del enviador no revierte el cierre', async () => {
    correos.fallar = true;
    const id = await ticket('resuelta');
    const registro = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await container.cierreAutomaticoService.procesar(AHORA)).toBe(1);
      await new Promise((resolver) => setTimeout(resolver, 300));
      expect(await estado(id)).toMatchObject({ estado: 'cerrada' });
      expect(registro).toHaveBeenCalledWith(expect.stringContaining('queja_cerrada_automaticamente'));
    } finally {
      registro.mockRestore();
    }
  });
});
