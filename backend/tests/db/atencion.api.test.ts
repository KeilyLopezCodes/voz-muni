import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { ASUETOS_2026_2027 } from '../../src/infrastructure/database/seed-helpers/asuetos-guatemala';
import { generarCalendario } from '../../src/infrastructure/database/seed-helpers/calendario';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

describe('Atención de la queja (SPEC 22)', () => {
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

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    const [fugas] = await db('categorias').insert({ nombre: 'Fugas', dependencia_id: ids.agua }).returning('id');
    ids.baches = Number(baches.id);
    ids.fugas = Number(fugas.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);
    // El calendario de seed:dev: resolver calcula con él el plazo de confirmación (SPEC 27).
    await db('calendario_laboral').insert(generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027));

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['tecnico', 'tecnico', ids.obras],
      ['otroTecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['coordinadorAgua', 'coordinador', ids.agua],
      ['supervisor', 'supervisor', null],
      ['receptor', 'receptor', null],
      ['vecino', 'vecino', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@atencion.test`,
          telefono: '55557777',
          dpi: clave === 'vecino' ? '2547123450101' : null,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@atencion.test`, password: PASSWORD });
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

  interface OpcionesTicket {
    estado?: EstadoTicket;
    asignadoA?: number | null;
    dependencia?: 'obras' | 'agua';
    prioridad?: string;
    creadoEn?: Date;
    solicitanteId?: number;
  }

  // Un ticket ya aceptado (SPEC 19) y, por defecto, asignado al técnico (SPEC 20).
  async function ticket({
    estado = 'asignada',
    asignadoA = ids.tecnico,
    dependencia = 'obras',
    prioridad = 'media',
    creadoEn = new Date(),
    solicitanteId = ids.vecino,
  }: OpcionesTicket = {}): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitanteId,
        registrado_por: solicitanteId,
        categoria_id: dependencia === 'obras' ? ids.baches : ids.fugas,
        dependencia_id: dependencia === 'obras' ? ids.obras : ids.agua,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad,
        asignado_a: asignadoA,
        creado_en: creadoEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const transicion = (id: number, cuerpo: object, quien = 'tecnico') =>
    request(app).post(`/api/v1/tickets/${id}/transiciones`).set(auth(quien)).send(cuerpo);
  const bandeja = (query = '', quien = 'tecnico') => request(app).get(`/api/v1/tickets/atencion${query}`).set(auth(quien));
  const historial = (id: number) =>
    db('ticket_historial')
      .where({ ticket_id: id })
      .orderBy('id')
      .select('estado_anterior', 'estado_nuevo', 'usuario_id', 'motivo');

  // Primero, con la base sin otros tickets: la bandeja se compara completa.
  describe('GET /tickets/atencion', () => {
    const t: Record<string, number> = {};
    const hace = (horas: number) => new Date(Date.now() - horas * 3600_000);

    beforeAll(async () => {
      t.asignadaBaja = await ticket({ prioridad: 'baja', creadoEn: hace(40) });
      t.procesoUrgente = await ticket({ estado: 'en_proceso', prioridad: 'urgente', creadoEn: hace(2) });
      t.esperaAlta = await ticket({ estado: 'en_espera', prioridad: 'alta', creadoEn: hace(20) });
      t.otroTecnico = await ticket({ prioridad: 'urgente', asignadoA: ids.otroTecnico, creadoEn: hace(30) });
      t.sinTecnico = await ticket({ prioridad: 'alta', asignadoA: null, creadoEn: hace(10) });
      t.resuelta = await ticket({ estado: 'resuelta', asignadoA: ids.tecnico });
      t.agua = await ticket({ dependencia: 'agua', prioridad: 'urgente', asignadoA: null, creadoEn: hace(1) });
      await db('ticket_historial').insert([
        { ticket_id: t.esperaAlta, estado_anterior: 'en_proceso', estado_nuevo: 'en_espera', usuario_id: ids.tecnico, motivo: 'Motivo viejo', creado_en: hace(5) },
        { ticket_id: t.esperaAlta, estado_anterior: 'en_proceso', estado_nuevo: 'en_espera', usuario_id: ids.tecnico, motivo: 'Falta la foto del bache', creado_en: hace(1) },
      ]);
      await db('solicitudes_traslado').insert({
        ticket_id: t.procesoUrgente,
        solicitado_por: ids.tecnico,
        dependencia_origen_id: ids.obras,
        motivo: 'Es de agua',
      });
    });

    it('el técnico ve solo sus asignadas abiertas, por prioridad y antigüedad, con motivoEspera y trasladoPendiente', async () => {
      const res = await bandeja();

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ pagina: 1, tamano: 20, total: 3 });
      expect(res.body.datos.map((d: { id: number }) => d.id)).toEqual([t.procesoUrgente, t.esperaAlta, t.asignadaBaja]);
      const [proceso, espera, asignada] = res.body.datos;
      expect(proceso).toMatchObject({ estado: 'en_proceso', trasladoPendiente: true, motivoEspera: null });
      expect(espera).toMatchObject({ estado: 'en_espera', trasladoPendiente: false, motivoEspera: 'Falta la foto del bache' });
      expect(asignada).toEqual({
        id: t.asignadaBaja,
        numero: expect.stringMatching(/^Q-2026-\d{6}$/),
        estado: 'asignada',
        prioridad: 'baja',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        categoria: { id: ids.baches, nombre: 'Baches' },
        dependencia: { id: ids.obras, nombre: 'Dirección de Obras' },
        zona: { id: ids.zona, nombre: 'Zona 1', tipo: 'zona' },
        direccion: '5a avenida 3-20, zona 1',
        datosExtra: {},
        ubicacion: null,
        tecnico: { id: ids.tecnico, nombre: 'Usuario tecnico' },
        motivoEspera: null,
        trasladoPendiente: false,
        creadoEn: expect.stringMatching(/Z$/),
        sla: expect.objectContaining({ pausado: false }), // SPEC 30
      });
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain('vecino@atencion.test');
      expect(texto).not.toContain('55557777');
      expect(texto).not.toContain('2547123450101');
    });

    it('el filtro por estado funciona', async () => {
      expect((await bandeja('?estado=en_espera')).body.datos.map((d: { id: number }) => d.id)).toEqual([t.esperaAlta]);
      expect((await bandeja('?estado=asignada')).body.datos.map((d: { id: number }) => d.id)).toEqual([t.asignadaBaja]);
    });

    it('el coordinador ve su dependencia, con o sin técnico; el supervisor ve todas, y pagina', async () => {
      const coordinador = await bandeja('', 'coordinador');
      expect(coordinador.body.datos.map((d: { id: number }) => d.id)).toEqual([
        t.otroTecnico,
        t.procesoUrgente,
        t.esperaAlta,
        t.sinTecnico,
        t.asignadaBaja,
      ]);

      const supervisor = await bandeja('?tamano=2&pagina=1', 'supervisor');
      expect(supervisor.body).toMatchObject({ total: 6, tamano: 2 });
      expect(supervisor.body.datos.map((d: { id: number }) => d.id)).toEqual([t.otroTecnico, t.procesoUrgente]);
    });

    it.each(['vecino', 'receptor', 'administrador'])('el %s recibe 403 en la bandeja', async (quien) => {
      expect((await bandeja('', quien)).status).toBe(403);
    });

    it.each(['?estado=resuelta', '?tamano=51', '?pagina=0', '?otro=1'])('%s → 400', async (query) => {
      expect((await bandeja(query)).status).toBe(400);
    });
  });

  it('el técnico asignado inicia, pone en espera, reanuda y resuelve: 4 filas de historial y resuelto_en', async () => {
    const id = await ticket();

    const iniciar = await transicion(id, { accion: 'iniciar' });
    expect(iniciar.status).toBe(200);
    expect(iniciar.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-2026-/),
      estado: 'en_proceso',
      asignadoA: ids.tecnico,
      resueltoEn: null,
    });
    expect((await transicion(id, { accion: 'poner_en_espera', motivo: '  ¿Cuál es el número de casa? ' })).status).toBe(200);
    expect((await transicion(id, { accion: 'reanudar' })).status).toBe(200);
    const resolver = await transicion(id, { accion: 'resolver', descripcion: ' Se rellenó el bache con asfalto ' });
    expect(resolver.status).toBe(200);
    // La respuesta no cambia con SPEC 26: la resolución no viaja en ella.
    expect(resolver.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-2026-/),
      estado: 'resuelta',
      asignadoA: ids.tecnico,
      resueltoEn: expect.stringMatching(/Z$/),
    });

    const tecnico = String(ids.tecnico);
    expect(await historial(id)).toEqual([
      { estado_anterior: 'asignada', estado_nuevo: 'en_proceso', usuario_id: tecnico, motivo: null },
      { estado_anterior: 'en_proceso', estado_nuevo: 'en_espera', usuario_id: tecnico, motivo: '¿Cuál es el número de casa?' },
      { estado_anterior: 'en_espera', estado_nuevo: 'en_proceso', usuario_id: tecnico, motivo: null },
      { estado_anterior: 'en_proceso', estado_nuevo: 'resuelta', usuario_id: tecnico, motivo: 'Se rellenó el bache con asfalto' },
    ]);
    expect((await db('tickets').where({ id }).first('resuelto_en')).resuelto_en).toBeInstanceOf(Date);
    // SPEC 26: la resolución vigente coincide con el motivo del historial y guarda quién resolvió.
    expect(await db('tickets').where({ id }).first('resolucion', 'resuelto_por')).toEqual({
      resolucion: 'Se rellenó el bache con asfalto',
      resuelto_por: tecnico,
    });
  });

  describe('plazo de confirmación al resolver (SPEC 27)', () => {
    const resolver = (id: number) => transicion(id, { accion: 'resolver', descripcion: 'Se rellenó el bache' });

    it('guarda confirmacion_vence_en: fin del 5.º día hábil posterior, en Guatemala', async () => {
      const id = await ticket({ estado: 'en_proceso' });

      expect((await resolver(id)).status).toBe(200);

      // La expectativa se calcula en SQL, sin el código del dominio.
      const { rows } = await db.raw(
        `SELECT t.confirmacion_vence_en AS guardado,
                (SELECT (c.fecha + time '23:59:59.999') AT TIME ZONE 'America/Guatemala'
                   FROM calendario_laboral c
                  WHERE c.es_habil AND c.fecha > (t.resuelto_en AT TIME ZONE 'America/Guatemala')::date
                  ORDER BY c.fecha OFFSET 4 LIMIT 1) AS esperado
           FROM tickets t WHERE t.id = ?`,
        [id],
      );
      expect(rows[0].guardado).toBeInstanceOf(Date);
      expect(rows[0].guardado.toISOString()).toBe(rows[0].esperado.toISOString());
      expect(rows[0].guardado.toISOString()).toMatch(/T05:59:59\.999Z$/);
    });

    it('con el calendario vacío responde 409 CALENDARIO_INCOMPLETO y la queja sigue en en_proceso', async () => {
      const id = await ticket({ estado: 'en_proceso' });
      const calendario = await db('calendario_laboral').select('*');
      await db('calendario_laboral').delete();
      try {
        const res = await resolver(id);

        expect(res.status).toBe(409);
        expect(res.body.codigo).toBe('CALENDARIO_INCOMPLETO');
      } finally {
        await db('calendario_laboral').insert(calendario);
      }
      expect(await db('tickets').where({ id }).first('estado', 'resolucion', 'confirmacion_vence_en')).toEqual({
        estado: 'en_proceso',
        resolucion: null,
        confirmacion_vence_en: null,
      });
      expect(await historial(id)).toEqual([]);
    });

    it.each([0, 31, 2.5, '5'])('con plazo_confirmacion_dias_habiles = %j responde 409 PARAMETRO_INVALIDO', async (valor) => {
      const id = await ticket({ estado: 'en_proceso' });
      await db('parametros').where({ clave: 'plazo_confirmacion_dias_habiles' }).update({ valor: JSON.stringify(valor) });
      try {
        const res = await resolver(id);

        expect(res.status).toBe(409);
        expect(res.body.codigo).toBe('PARAMETRO_INVALIDO');
      } finally {
        await db('parametros').where({ clave: 'plazo_confirmacion_dias_habiles' }).update({ valor: '5' });
      }
      expect((await db('tickets').where({ id }).first('estado')).estado).toBe('en_proceso');
    });
  });

  it('un técnico no asignado → 404', async () => {
    const id = await ticket();

    expect((await transicion(id, { accion: 'iniciar' }, 'otroTecnico')).status).toBe(404);
  });

  it('el coordinador de la dependencia resuelve → 200; el de otra dependencia → 404', async () => {
    const id = await ticket({ estado: 'en_proceso' });

    expect((await transicion(id, { accion: 'resolver', descripcion: 'x' }, 'coordinadorAgua')).status).toBe(404);
    const res = await transicion(id, { accion: 'resolver', descripcion: 'Resuelto por el coordinador' }, 'coordinador');
    expect(res.status).toBe(200);
    const ultima = (await historial(id)).at(-1)!;
    expect(ultima.usuario_id).toBe(String(ids.coordinador));
    expect(await db('tickets').where({ id }).first('resolucion', 'resuelto_por')).toEqual({
      resolucion: ultima.motivo,
      resuelto_por: String(ids.coordinador),
    });
  });

  it('resolver con descripción en blanco no toca la resolución (SPEC 26)', async () => {
    const id = await ticket({ estado: 'en_proceso' });

    expect((await transicion(id, { accion: 'resolver', descripcion: '   ' })).status).toBe(400);
    expect(await db('tickets').where({ id }).first('estado', 'resolucion', 'resuelto_por')).toEqual({
      estado: 'en_proceso',
      resolucion: null,
      resuelto_por: null,
    });
  });

  it('el supervisor inicia cualquiera → 200', async () => {
    const id = await ticket({ dependencia: 'agua', asignadoA: ids.tecnico });

    expect((await transicion(id, { accion: 'iniciar' }, 'supervisor')).status).toBe(200);
  });

  it.each(['vecino', 'receptor', 'administrador'])('el %s recibe 403 PERMISO_DENEGADO en las 4 acciones', async (quien) => {
    const id = await ticket({ solicitanteId: ids.vecino });

    for (const cuerpo of [
      { accion: 'iniciar' },
      { accion: 'poner_en_espera', motivo: 'x' },
      { accion: 'reanudar' },
      { accion: 'resolver', descripcion: 'x' },
    ]) {
      const res = await transicion(id, cuerpo, quien);
      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('PERMISO_DENEGADO');
    }
  });

  it('el técnico no puede hacer acciones del triage (403), y el supervisor sigue pudiendo', async () => {
    const id = await ticket({ estado: 'nueva', asignadoA: null });
    await db('tickets').where({ id }).update({ dependencia_id: null, prioridad: null });

    expect((await transicion(id, { accion: 'tomar' }, 'tecnico')).status).toBe(403);
    expect((await transicion(id, { accion: 'tomar' }, 'supervisor')).status).toBe(200);
  });

  it.each([
    ['iniciar sin técnico', { asignadoA: null }, { accion: 'iniciar' }, 'supervisor', 400, 'TECNICO_REQUERIDO'],
    ['reanudar en en_proceso', { estado: 'en_proceso' as EstadoTicket }, { accion: 'reanudar' }, 'tecnico', 409, 'TRANSICION_INVALIDA'],
    ['resolver sin descripción', { estado: 'en_proceso' as EstadoTicket }, { accion: 'resolver' }, 'tecnico', 400, 'VALIDACION'],
    ['resolver con descripción en blanco', { estado: 'en_proceso' as EstadoTicket }, { accion: 'resolver', descripcion: '   ' }, 'tecnico', 400, 'DESCRIPCION_REQUERIDA'],
    ['poner en espera sin motivo', { estado: 'en_proceso' as EstadoTicket }, { accion: 'poner_en_espera', motivo: '' }, 'tecnico', 400, 'MOTIVO_REQUERIDO'],
    ['un motivo de 1001 caracteres', { estado: 'en_proceso' as EstadoTicket }, { accion: 'poner_en_espera', motivo: 'a'.repeat(1001) }, 'tecnico', 400, 'VALIDACION'],
  ])('%s → %i %s', async (_caso, opciones, cuerpo, quien, status, codigo) => {
    const id = await ticket(opciones);

    const res = await transicion(id, cuerpo, quien);

    expect(res.status).toBe(status);
    expect(res.body.codigo).toBe(codigo);
  });

  it('dos iniciar simultáneos: uno → 200 y el otro → 409, con una sola transición', async () => {
    const id = await ticket();

    const respuestas = await Promise.all([transicion(id, { accion: 'iniciar' }), transicion(id, { accion: 'iniciar' })]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db('ticket_historial').where({ ticket_id: id, estado_nuevo: 'en_proceso' })).toHaveLength(1);
  });
});
