import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const sinCorreo: EnviadorCorreo = { enviar: async () => {} };
const VECINO_EMAIL = 'Ana.Lopez@Correo.gt';
const MINUTO = 60_000;

// GET /api/v1/public/tickets/:numero?contacto= (SPEC 37) contra PostgreSQL.
describe('Consulta pública de una queja (SPEC 37)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    ids.obras = Number(obras.id);
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const rol = async (nombre: string) => (await db('roles').where({ nombre }).first('id')).id;
    const usuario = async (clave: string, datos: Record<string, unknown>) => {
      const [fila] = await db('usuarios').insert(datos).returning('id');
      ids[clave] = Number(fila.id);
    };
    await usuario('vecino', {
      nombre: 'Ana López Pérez',
      email: VECINO_EMAIL.toLowerCase(),
      telefono: '55550000',
      dpi: '1234567890101',
      rol_id: await rol('vecino'),
    });
    await usuario('ventanilla', { nombre: 'Beto Ventanilla', telefono: '44443333', dpi: '1234567890102', rol_id: await rol('vecino') });
    await usuario('tecnico', { nombre: 'Tito Técnico', email: 'tecnico@consulta.test', rol_id: await rol('tecnico'), dependencia_id: ids.obras });
    await usuario('supervisor', { nombre: 'Sara Supervisora', email: 'supervisor@consulta.test', rol_id: await rol('supervisor') });
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  let correlativo = 1;
  async function queja(cambios: Record<string, unknown> = {}, solicitante = ids.vecino): Promise<{ id: number; numero: string }> {
    const numero = `Q-2026-${String(correlativo++).padStart(6, '0')}`;
    const [fila] = await db('tickets')
      .insert({
        numero,
        solicitante_id: solicitante,
        registrado_por: solicitante,
        categoria_id: ids.baches,
        dependencia_id: ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Un bache grande que ya dañó dos carros',
        direccion: '5a avenida 3-20, casa verde',
        lat: 14.634915,
        lng: -90.506882,
        datos_extra: JSON.stringify({ profundidad: 30 }),
        estado: 'en_proceso',
        prioridad: 'urgente',
        asignado_a: ids.tecnico,
        creado_en: new Date(Date.now() - 60 * MINUTO),
        ...cambios,
      })
      .returning('id');
    return { id: Number(fila.id), numero };
  }

  const historial = (ticketId: number, filas: [string | null, string, number | null, string | null][]) =>
    db('ticket_historial').insert(
      filas.map(([anterior, nuevo, usuarioId, motivo], i) => ({
        ticket_id: ticketId,
        estado_anterior: anterior,
        estado_nuevo: nuevo,
        usuario_id: usuarioId,
        motivo,
        creado_en: new Date(Date.now() - (50 - i) * MINUTO),
      })),
    );

  const consultar = (numero: string, contacto: string, aplicacion = app) =>
    request(aplicacion).get(`/api/v1/public/tickets/${numero}`).query({ contacto });

  it('con el correo correcto responde 200 con el contenido completo y Cache-Control: no-store', async () => {
    const { id, numero } = await queja({ estado: 'en_espera' });
    await historial(id, [
      [null, 'nueva', ids.vecino, null],
      ['nueva', 'en_revision', ids.supervisor, null],
      ['asignada', 'en_proceso', ids.tecnico, null],
      ['en_proceso', 'en_espera', ids.tecnico, 'Necesitamos una foto del bache'],
    ]);
    await db('comentarios').insert([
      { ticket_id: id, autor_id: ids.tecnico, cuerpo: 'Vamos el jueves', es_interno: false, creado_en: new Date(Date.now() - 20 * MINUTO) },
      { ticket_id: id, autor_id: ids.tecnico, cuerpo: 'Llevar la mezcladora', es_interno: true, creado_en: new Date(Date.now() - 15 * MINUTO) },
      { ticket_id: id, autor_id: ids.vecino, cuerpo: 'Gracias', es_interno: false, creado_en: new Date(Date.now() - 10 * MINUTO) },
    ]);

    const res = await consultar(numero, `  ${VECINO_EMAIL.toUpperCase()} `);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      numero,
      titulo: 'Bache frente a la escuela',
      estado: 'en_espera',
      categoria: 'Baches',
      zona: 'Zona 1',
      esperaRespuesta: true,
      cierreAutomatico: false,
      solucion: null,
      confirmacion: null,
    });
    expect(res.body.lineaTiempo.map((e: { actor: string; estadoNuevo: string; motivo: string | null }) => [e.actor, e.estadoNuevo, e.motivo])).toEqual([
      ['municipalidad', 'en_espera', 'Necesitamos una foto del bache'],
      ['municipalidad', 'en_proceso', null],
      ['municipalidad', 'en_revision', null],
      ['vecino', 'nueva', null],
    ]);
    expect(res.body.comentarios.map((c: { autor: string; cuerpo: string }) => [c.autor, c.cuerpo])).toEqual([
      ['municipalidad', 'Vamos el jueves'],
      ['vecino', 'Gracias'],
    ]);
  });

  it('con el teléfono de un vecino de ventanilla sin correo responde 200', async () => {
    const { numero } = await queja({}, ids.ventanilla);
    expect((await consultar(numero, '4444-3333')).status).toBe(200);
  });

  it('un contacto incorrecto y un número inexistente responden el mismo 404', async () => {
    const { numero } = await queja();

    const ajeno = await consultar(numero, 'otra@correo.gt');
    const telefonoAjeno = await consultar(numero, '44443333');
    const inexistente = await consultar('Q-2026-999999', VECINO_EMAIL);

    for (const res of [ajeno, telefonoAjeno, inexistente]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ codigo: 'CONSULTA_NO_ENCONTRADA', mensaje: 'No encontramos una queja con esos datos' });
    }
  });

  it('un número en minúsculas funciona; un formato o un teléfono inválido, o sin contacto, responden 400', async () => {
    const { numero } = await queja();

    expect((await consultar(numero.toLowerCase(), VECINO_EMAIL)).status).toBe(200);
    expect((await consultar('Q-26-1', VECINO_EMAIL)).body.codigo).toBe('VALIDACION');
    expect((await consultar(numero, '1234')).body.codigo).toBe('VALIDACION');
    expect((await request(app).get(`/api/v1/public/tickets/${numero}`)).status).toBe(400);
  });

  it('nunca expone datos personales, notas internas, asignaciones ni traslados', async () => {
    const { id, numero } = await queja({ estado: 'en_revision', dependencia_id: null, asignado_a: null, prioridad: null });
    await historial(id, [
      [null, 'nueva', ids.vecino, null],
      ['asignada', 'en_revision', ids.supervisor, 'Motivo interno del traslado'],
    ]);
    await db('ticket_asignaciones').insert({ ticket_id: id, tecnico_anterior: null, tecnico_nuevo: ids.tecnico, asignado_por: ids.supervisor });
    await db('comentarios').insert({ ticket_id: id, autor_id: ids.tecnico, cuerpo: 'Nota solo para internos', es_interno: true });

    const res = await consultar(numero, VECINO_EMAIL);
    const texto = JSON.stringify(res.body);

    expect(res.status).toBe(200);
    for (const prohibido of [
      'Ana López',
      'ana.lopez',
      '55550000',
      '1234567890101',
      '5a avenida',
      '14.63',
      '-90.50',
      'profundidad',
      'Tito Técnico',
      'Dirección de Obras',
      'urgente',
      'Nota solo para internos',
      'Motivo interno del traslado',
      'asignacion',
      'traslado',
    ]) {
      expect(texto).not.toContain(prohibido);
    }
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'numero',
        'titulo',
        'estado',
        'categoria',
        'zona',
        'creadoEn',
        'resueltoEn',
        'cerradoEn',
        'cierreAutomatico',
        'esperaRespuesta',
        'solucion',
        'confirmacion',
        'lineaTiempo',
        'comentarios',
      ].sort(),
    );
  });

  it('muestra el motivo de un rechazo, la solución con su plazo y el cierre automático', async () => {
    const rechazada = await queja({ estado: 'rechazada', dependencia_id: null, asignado_a: null, prioridad: null });
    await historial(rechazada.id, [['en_revision', 'rechazada', ids.supervisor, 'Está fuera del municipio']]);
    expect((await consultar(rechazada.numero, VECINO_EMAIL)).body.lineaTiempo[0].motivo).toBe('Está fuera del municipio');

    const vence = new Date(Date.now() + 3 * 24 * 60 * MINUTO);
    const resuelta = await queja({
      estado: 'resuelta',
      resolucion: 'Se rellenó <b>el bache</b>',
      resuelto_en: new Date(),
      resuelto_por: ids.tecnico,
      confirmacion_vence_en: vence,
    });
    expect((await consultar(resuelta.numero, VECINO_EMAIL)).body).toMatchObject({
      solucion: { descripcion: 'Se rellenó <b>el bache</b>' },
      confirmacion: { venceEn: vence.toISOString(), vencida: false },
    });

    const cerrada = await queja({
      estado: 'cerrada',
      resolucion: 'Se rellenó',
      resuelto_en: new Date(Date.now() - 10 * 24 * 60 * MINUTO),
      cerrado_en: new Date(),
    });
    await historial(cerrada.id, [['resuelta', 'cerrada', null, null]]);
    const res = await consultar(cerrada.numero, VECINO_EMAIL);
    expect(res.body).toMatchObject({ cierreAutomatico: true, confirmacion: null, solucion: { descripcion: 'Se rellenó' } });
    expect(res.body.lineaTiempo[0].actor).toBe('sistema');
  });

  it('la consulta 11 desde la misma IP responde 429', async () => {
    const limitado = buildContainer(envDePrueba({ CONSULTA_LIMITE_POR_VENTANA: 10 }), { enviadorCorreo: sinCorreo });
    try {
      const aplicacion = createApp(limitado);
      const { numero } = await queja();
      for (let i = 0; i < 10; i++) {
        expect((await consultar(numero, i % 2 === 0 ? VECINO_EMAIL : 'otra@correo.gt', aplicacion)).status).not.toBe(429);
      }
      const once = await consultar(numero, VECINO_EMAIL, aplicacion);
      expect(once.status).toBe(429);
      expect(once.body.codigo).toBe('DEMASIADAS_PETICIONES');
    } finally {
      await limitado.dispose();
    }
  });

  it('un error en la ruta no deja el contacto en el log', async () => {
    const errores = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consulta = jest
      .spyOn(container.consultaPublicaService, 'consultar')
      .mockRejectedValueOnce(new Error(`fallo al buscar ${VECINO_EMAIL}`));
    try {
      const res = await consultar('Q-2026-000001', VECINO_EMAIL);

      expect(res.status).toBe(500);
      const logs = errores.mock.calls.map((llamada) => llamada.map((v) => (v instanceof Error ? `${v.message} ${v.stack}` : String(v))).join(' '));
      expect(logs.join('\n')).not.toMatch(/ana\.lopez|contacto=/i);
      expect(logs).toEqual(['Error interno en GET /api/v1/public/tickets/Q-2026-000001: Error']);
    } finally {
      consulta.mockRestore();
      errores.mockRestore();
    }
  });
});
