import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EventoLineaTiempo, FiltroLineaTiempo } from '../../src/domain/repositories/linea-tiempo-repository';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { KnexLineaTiempoRepository } from '../../src/infrastructure/repositories/knex-linea-tiempo-repository';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const NOTA_INTERNA = 'Texto de la nota interna que nadie fuera debe leer';
const COMENTARIO_PUBLICO = 'Texto del comentario público del vecino';

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(_mensaje: MensajeCorreo): Promise<void> {}
}

// Instantes de la queja principal, en orden. Algunos llevan microsegundos para probar el corte a milisegundos.
const T = (minuto: number, micro = '000000') => `2026-10-20T15:${String(minuto).padStart(2, '0')}:00.${micro}Z`;

describe('Línea de tiempo de la queja (SPEC 28)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let repo: KnexLineaTiempoRepository;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  async function ticket(asignadoA: number | null, estado: EstadoTicket, solicitante = ids.vecino): Promise<number> {
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
        prioridad: 'alta',
        asignado_a: asignadoA,
        creado_en: T(0),
      })
      .returning('id');
    return Number(fila.id);
  }

  async function historial(
    ticketId: number,
    anterior: EstadoTicket | null,
    nuevo: EstadoTicket,
    usuarioId: number | null,
    creadoEn: string,
    motivo: string | null = null,
  ): Promise<number> {
    const [fila] = await db('ticket_historial')
      .insert({ ticket_id: ticketId, estado_anterior: anterior, estado_nuevo: nuevo, usuario_id: usuarioId, motivo, creado_en: creadoEn })
      .returning('id');
    return Number(fila.id);
  }

  async function comentario(ticketId: number, autorId: number, cuerpo: string, interno: boolean, creadoEn: string) {
    const [fila] = await db('comentarios')
      .insert({ ticket_id: ticketId, autor_id: autorId, cuerpo, es_interno: interno, creado_en: creadoEn })
      .returning('id');
    return Number(fila.id);
  }

  let rutas = 0;
  async function adjunto(ticketId: number, autorId: number, nombre: string, interno: boolean, creadoEn: string) {
    const hex = (rutas++).toString(16).padStart(12, '0');
    const [fila] = await db('adjuntos')
      .insert({
        ticket_id: ticketId,
        nombre,
        ruta: `ab/ab000000-0000-4000-8000-${hex}`,
        tipo_mime: 'image/jpeg',
        tamano_bytes: 10,
        subido_por: autorId,
        interno,
        origen: interno ? 'atencion' : 'registro',
        creado_en: creadoEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  async function traslado(datos: Record<string, unknown>): Promise<number> {
    const [fila] = await db('solicitudes_traslado').insert(datos).returning('id');
    return Number(fila.id);
  }

  const filtro = (cambios: Partial<FiltroLineaTiempo> = {}): FiltroLineaTiempo => ({
    vistaPublica: false,
    incluirInternos: true,
    usuarioId: ids.coordinador,
    antesDe: null,
    limite: 100,
    ...cambios,
  });

  const get = (ticketId: number, usuario: string, query = '') =>
    request(app).get(`/api/v1/tickets/${ticketId}/linea-tiempo${query}`).set('Authorization', `Bearer ${tokens[usuario]}`);

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria() });
    app = createApp(container);
    repo = new KnexLineaTiempoRepository(db);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    ids.obras = Number(obras.id);
    const [alumbrado] = await db('dependencias').insert({ nombre: 'Alumbrado Público' }).returning('id');
    ids.alumbrado = Number(alumbrado.id);
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['vecino', 'vecino', null],
      ['otroVecino', 'vecino', null],
      ['tecnico', 'tecnico', ids.obras],
      ['tecnico2', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['coordinadorAlumbrado', 'coordinador', ids.alumbrado],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [indice, [clave, rol, dependenciaId]] of usuarios.entries()) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@linea.test`,
          telefono: '55557777',
          dpi: String(2000000000000 + indice),
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@linea.test`, password: PASSWORD });
      tokens[clave] = res.body.accessToken;
    }

    // Queja principal: triage, dos asignaciones, una solicitud rechazada, una espera respondida por el vecino,
    // un comentario público, una nota interna y adjuntos de los dos tipos.
    ids.principal = await ticket(ids.tecnico, 'en_proceso');
    const p = ids.principal;
    ids.hCreacion = await historial(p, null, 'nueva', ids.vecino, T(0));
    ids.adjPublico = await adjunto(p, ids.vecino, 'foto-del-bache.jpg', false, T(0, '500000'));
    await historial(p, 'nueva', 'en_revision', ids.supervisor, T(1));
    await historial(p, 'en_revision', 'asignada', ids.supervisor, T(2), 'Categoría: Aceras → Baches');
    await db('ticket_asignaciones').insert({
      ticket_id: p,
      tecnico_anterior: null,
      tecnico_nuevo: ids.tecnico2,
      asignado_por: ids.coordinador,
      creado_en: T(3),
    });
    await db('ticket_asignaciones').insert({
      ticket_id: p,
      tecnico_anterior: ids.tecnico2,
      tecnico_nuevo: ids.tecnico,
      asignado_por: ids.coordinador,
      motivo: 'Tiene menos carga',
      creado_en: T(4),
    });
    await historial(p, 'asignada', 'en_proceso', ids.tecnico, T(5));
    ids.rechazada = await traslado({
      ticket_id: p,
      solicitado_por: ids.tecnico,
      dependencia_origen_id: ids.obras,
      dependencia_sugerida_id: ids.alumbrado,
      motivo: 'Es un poste caído',
      estado: 'rechazada',
      resuelto_por: ids.supervisor,
      motivo_resolucion: 'Sí es un bache',
      creado_en: T(6),
      resuelto_en: T(7),
    });
    await historial(p, 'en_proceso', 'en_espera', ids.tecnico, T(8), '¿Puede enviar una foto de cerca?');
    ids.comPublico = await comentario(p, ids.vecino, COMENTARIO_PUBLICO, false, T(9));
    await historial(p, 'en_espera', 'en_proceso', ids.vecino, T(9, '000500'));
    ids.comInterno = await comentario(p, ids.tecnico, NOTA_INTERNA, true, T(10));
    ids.adjInterno = await adjunto(p, ids.tecnico, 'evidencia-interna.jpg', true, T(11));

    // Queja rechazada en el triage.
    ids.rechazo = await ticket(null, 'rechazada');
    await historial(ids.rechazo, null, 'nueva', ids.vecino, T(0));
    await historial(ids.rechazo, 'nueva', 'en_revision', ids.supervisor, T(1));
    await historial(ids.rechazo, 'en_revision', 'rechazada', ids.supervisor, T(2), 'Es un duplicado de Q-2026-000001');

    // Queja trasladada directo por el supervisor, con una solicitud retirada y otra sin efecto antes.
    ids.trasladada = await ticket(null, 'en_revision');
    const tr = ids.trasladada;
    await historial(tr, null, 'nueva', ids.vecino, T(0));
    ids.retirada = await traslado({
      ticket_id: tr,
      solicitado_por: ids.coordinador,
      dependencia_origen_id: ids.obras,
      motivo: 'Lo pensé mejor',
      estado: 'retirada',
      resuelto_por: ids.coordinador,
      creado_en: T(1),
      resuelto_en: T(2),
    });
    ids.sinEfecto = await traslado({
      ticket_id: tr,
      solicitado_por: ids.tecnico,
      dependencia_origen_id: ids.obras,
      motivo: 'Tampoco es de Obras',
      estado: 'sin_efecto',
      resuelto_por: ids.supervisor,
      creado_en: T(3),
      resuelto_en: T(4),
    });
    ids.directo = await traslado({
      ticket_id: tr,
      solicitado_por: ids.supervisor,
      dependencia_origen_id: ids.obras,
      dependencia_sugerida_id: ids.alumbrado,
      motivo: 'Motivo del traslado directo',
      estado: 'aprobada',
      resuelto_por: ids.supervisor,
      creado_en: T(5),
      resuelto_en: T(5, '000300'),
    });
    await historial(tr, 'asignada', 'en_revision', ids.supervisor, T(5, '000300'), 'Motivo del traslado directo');
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  describe('repositorio', () => {
    it('devuelve todos los eventos de la queja en orden ocurridoEn DESC, id DESC', async () => {
      const eventos = await repo.listar(ids.principal, filtro());
      expect(eventos.map((e) => e.detalle.tipo)).toEqual([
        'adjunto',
        'comentario',
        'estado', // en_espera → en_proceso, a los 500 µs del comentario: el corte a milisegundos los empata
        'comentario',
        'estado',
        'traslado_rechazado',
        'traslado_solicitado',
        'estado',
        'asignacion',
        'asignacion',
        'estado',
        'estado',
        'adjunto',
        'estado',
      ]);
      // A igual instante, desempata el id con el prefijo del tipo.
      expect(eventos[2].ocurridoEn).toBe(eventos[3].ocurridoEn);
      expect(eventos[2].id > eventos[3].id).toBe(true);
      for (let i = 1; i < eventos.length; i++) {
        expect(eventos[i - 1].ocurridoEn >= eventos[i].ocurridoEn).toBe(true);
      }
    });

    it('arma cada tipo con su detalle y su actor', async () => {
      const eventos = await repo.listar(ids.principal, filtro());
      const porTipo = (tipo: string) => eventos.filter((e) => e.detalle.tipo === tipo);
      expect(eventos.at(-1)).toEqual({
        id: `estado:${ids.hCreacion}`,
        ocurridoEn: '2026-10-20T15:00:00.000Z',
        actor: { tipo: 'usuario', id: ids.vecino, nombre: 'Usuario vecino', rol: 'vecino', esSolicitante: true },
        detalle: { tipo: 'estado', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null },
      });
      expect(porTipo('asignacion').map((e) => e.detalle)).toEqual([
        {
          tipo: 'asignacion',
          tecnicoAnterior: { id: ids.tecnico2, nombre: 'Usuario tecnico2' },
          tecnicoNuevo: { id: ids.tecnico, nombre: 'Usuario tecnico' },
          motivo: 'Tiene menos carga',
        },
        { tipo: 'asignacion', tecnicoAnterior: null, tecnicoNuevo: { id: ids.tecnico2, nombre: 'Usuario tecnico2' }, motivo: null },
      ]);
      expect(porTipo('asignacion')[0].actor).toMatchObject({ tipo: 'usuario', id: ids.coordinador, rol: 'coordinador', esSolicitante: false });
      expect(porTipo('traslado_solicitado')[0]).toMatchObject({
        id: `traslado_solicitado:${ids.rechazada}`,
        actor: { tipo: 'usuario', id: ids.tecnico },
        detalle: {
          solicitudId: ids.rechazada,
          dependenciaOrigen: 'Dirección de Obras',
          dependenciaSugerida: 'Alumbrado Público',
          motivo: 'Es un poste caído',
        },
      });
      expect(porTipo('traslado_rechazado')[0]).toMatchObject({
        id: `traslado_rechazado:${ids.rechazada}`,
        ocurridoEn: '2026-10-20T15:07:00.000Z',
        actor: { tipo: 'usuario', id: ids.supervisor },
        detalle: { solicitudId: ids.rechazada, motivo: 'Sí es un bache' },
      });
      expect(porTipo('comentario').map((e) => e.detalle)).toEqual([
        { tipo: 'comentario', comentarioId: ids.comInterno, interno: true },
        { tipo: 'comentario', comentarioId: ids.comPublico, interno: false },
      ]);
      expect(porTipo('adjunto').map((e) => e.detalle)).toEqual([
        { tipo: 'adjunto', adjuntoId: ids.adjInterno, nombre: 'evidencia-interna.jpg', interno: true },
        { tipo: 'adjunto', adjuntoId: ids.adjPublico, nombre: 'foto-del-bache.jpg', interno: false },
      ]);
    });

    it('una transición del sistema tiene actor sistema', async () => {
      const id = await ticket(null, 'cerrada');
      await historial(id, 'resuelta', 'cerrada', null, T(30));
      const [evento] = await repo.listar(id, filtro());
      expect(evento.actor).toEqual({ tipo: 'sistema' });
    });

    it('un traslado directo no produce traslado_solicitado; retirada y sin efecto sí producen su evento', async () => {
      const eventos = await repo.listar(ids.trasladada, filtro());
      expect(eventos.map((e) => e.id)).toEqual([
        expect.stringMatching(/^estado:/),
        `traslado_sin_efecto:${ids.sinEfecto}`,
        `traslado_solicitado:${ids.sinEfecto}`,
        `traslado_retirado:${ids.retirada}`,
        `traslado_solicitado:${ids.retirada}`,
        expect.stringMatching(/^estado:/),
      ]);
      expect(eventos.find((e) => e.id === `traslado_retirado:${ids.retirada}`)).toMatchObject({
        actor: { tipo: 'usuario', id: ids.coordinador },
        detalle: { tipo: 'traslado_retirado', motivo: null },
      });
      expect(eventos.find((e) => e.id === `traslado_sin_efecto:${ids.sinEfecto}`)).toMatchObject({
        actor: { tipo: 'usuario', id: ids.supervisor },
        detalle: { tipo: 'traslado_sin_efecto', motivo: null },
      });
      expect(eventos.map((e) => e.id)).not.toContain(`traslado_solicitado:${ids.directo}`);
    });

    it('sin internos omite la nota interna y el adjunto interno', async () => {
      const eventos = await repo.listar(ids.principal, filtro({ incluirInternos: false }));
      expect(eventos.map((e) => e.id)).not.toContain(`comentario:${ids.comInterno}`);
      expect(eventos.map((e) => e.id)).not.toContain(`adjunto:${ids.adjInterno}`);
      expect(eventos.map((e) => e.id)).toContain(`comentario:${ids.comPublico}`);
      expect(eventos.map((e) => e.id)).toContain(`adjunto:${ids.adjPublico}`);
    });

    it('la vista pública omite asignaciones, traslados e internos', async () => {
      const eventos = await repo.listar(ids.principal, filtro({ vistaPublica: true, incluirInternos: true }));
      expect(new Set(eventos.map((e) => e.detalle.tipo))).toEqual(new Set(['estado', 'comentario', 'adjunto']));
      expect(eventos.some((e) => 'interno' in e.detalle && e.detalle.interno)).toBe(false);
    });

    it('dos páginas seguidas no repiten ni saltan eventos, con varios en el mismo instante', async () => {
      const id = await ticket(null, 'en_revision');
      const mismo = T(40, '123456');
      await historial(id, null, 'nueva', ids.vecino, T(40, '123100'));
      await historial(id, 'nueva', 'en_revision', ids.supervisor, mismo);
      await comentario(id, ids.vecino, 'Uno', false, mismo);
      await comentario(id, ids.supervisor, 'Dos', true, T(40, '123900'));
      await adjunto(id, ids.vecino, 'a.jpg', false, mismo);
      await historial(id, 'en_revision', 'en_revision', ids.supervisor, T(39));

      const todos = await repo.listar(id, filtro());
      expect(todos).toHaveLength(6);

      const vistos: EventoLineaTiempo[] = [];
      let antesDe: FiltroLineaTiempo['antesDe'] = null;
      for (let vuelta = 0; vuelta < 10; vuelta++) {
        const pagina = await repo.listar(id, filtro({ antesDe, limite: 2 }));
        vistos.push(...pagina);
        if (pagina.length < 2) {
          break;
        }
        const ultimo = pagina[pagina.length - 1];
        antesDe = { ocurridoEn: new Date(ultimo.ocurridoEn), id: ultimo.id };
        // Un evento nuevo entre una página y otra no cambia las siguientes.
        if (vuelta === 0) {
          await comentario(id, ids.vecino, 'Llega después', false, T(50));
        }
      }
      expect(vistos.map((e) => e.id)).toEqual(todos.map((e) => e.id));
    });
  });

  describe('GET /api/v1/tickets/:id/linea-tiempo', () => {
    it('el vecino de la queja ve la vista pública', async () => {
      const res = await get(ids.principal, 'vecino');
      expect(res.status).toBe(200);
      expect(res.body.siguienteCursor).toBeNull();
      const eventos: EventoLineaTiempo[] = res.body.datos;
      expect(new Set(eventos.map((e) => e.detalle.tipo))).toEqual(new Set(['estado', 'comentario', 'adjunto']));
      expect(eventos.map((e) => e.id)).not.toContain(`comentario:${ids.comInterno}`);
      expect(eventos.map((e) => e.id)).not.toContain(`adjunto:${ids.adjInterno}`);

      const estados = eventos.filter((e) => e.detalle.tipo === 'estado');
      expect(estados.map((e) => [e.detalle, e.actor])).toEqual([
        [{ tipo: 'estado', estadoAnterior: 'en_espera', estadoNuevo: 'en_proceso', motivo: null }, { tipo: 'tu' }],
        [
          { tipo: 'estado', estadoAnterior: 'en_proceso', estadoNuevo: 'en_espera', motivo: '¿Puede enviar una foto de cerca?' },
          { tipo: 'municipalidad' },
        ],
        [{ tipo: 'estado', estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null }, { tipo: 'municipalidad' }],
        // La nota del triage no es para el vecino.
        [{ tipo: 'estado', estadoAnterior: 'en_revision', estadoNuevo: 'asignada', motivo: null }, { tipo: 'municipalidad' }],
        [{ tipo: 'estado', estadoAnterior: 'nueva', estadoNuevo: 'en_revision', motivo: null }, { tipo: 'municipalidad' }],
        [{ tipo: 'estado', estadoAnterior: null, estadoNuevo: 'nueva', motivo: null }, { tipo: 'tu' }],
      ]);
    });

    it('el vecino ve el motivo del rechazo', async () => {
      const res = await get(ids.rechazo, 'vecino');
      expect(res.status).toBe(200);
      expect(res.body.datos[0].detalle).toEqual({
        tipo: 'estado',
        estadoAnterior: 'en_revision',
        estadoNuevo: 'rechazada',
        motivo: 'Es un duplicado de Q-2026-000001',
      });
    });

    it('el vecino no ve el motivo de un traslado ni las solicitudes', async () => {
      const res = await get(ids.trasladada, 'vecino');
      expect(res.status).toBe(200);
      expect(res.body.datos.map((e: EventoLineaTiempo) => e.detalle.tipo)).toEqual(['estado', 'estado']);
      expect(res.body.datos[0].detalle.motivo).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('Motivo del traslado directo');
    });

    it('otro vecino recibe 404', async () => {
      const res = await get(ids.principal, 'otroVecino');
      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe('NO_ENCONTRADO');
    });

    it.each(['tecnico', 'coordinador', 'supervisor'])('%s ve la vista interna completa', async (usuario) => {
      const res = await get(ids.principal, usuario);
      expect(res.status).toBe(200);
      const eventos: EventoLineaTiempo[] = res.body.datos;
      expect(eventos).toHaveLength(14);
      expect(eventos.map((e) => e.id)).toEqual(expect.arrayContaining([`comentario:${ids.comInterno}`, `adjunto:${ids.adjInterno}`]));
      expect(eventos.find((e) => e.detalle.tipo === 'asignacion')!.actor).toEqual({
        tipo: 'usuario',
        id: ids.coordinador,
        nombre: 'Usuario coordinador',
        rol: 'coordinador',
        esSolicitante: false,
      });
      expect(eventos.find((e) => e.detalle.tipo === 'estado' && e.detalle.estadoNuevo === 'asignada')!.detalle).toMatchObject({
        motivo: 'Categoría: Aceras → Baches',
      });
    });

    it.each(['tecnico2', 'coordinadorAlumbrado'])('%s recibe 404', async (usuario) => {
      const res = await get(ids.principal, usuario);
      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe('NO_ENCONTRADO');
    });

    it('el administrador no ve notas ni adjuntos internos', async () => {
      const res = await get(ids.principal, 'administrador');
      expect(res.status).toBe(200);
      const tiposIds = res.body.datos.map((e: EventoLineaTiempo) => e.id);
      expect(tiposIds).toHaveLength(12);
      expect(tiposIds).not.toContain(`comentario:${ids.comInterno}`);
      expect(tiposIds).not.toContain(`adjunto:${ids.adjInterno}`);
      expect(tiposIds).toContain(`traslado_rechazado:${ids.rechazada}`);
    });

    it('pagina con tamano y cursor', async () => {
      const primera = await get(ids.principal, 'coordinador', '?tamano=5');
      expect(primera.status).toBe(200);
      expect(primera.body.datos).toHaveLength(5);
      expect(primera.body.siguienteCursor).toEqual(expect.any(String));
      const segunda = await get(ids.principal, 'coordinador', `?tamano=5&cursor=${primera.body.siguienteCursor}`);
      const tercera = await get(ids.principal, 'coordinador', `?tamano=5&cursor=${segunda.body.siguienteCursor}`);
      expect(tercera.body.siguienteCursor).toBeNull();
      const completa = await get(ids.principal, 'coordinador');
      expect([...primera.body.datos, ...segunda.body.datos, ...tercera.body.datos]).toEqual(completa.body.datos);
    });

    it.each([
      ['un cursor mal formado', '?cursor=basura'],
      ['tamano = 101', '?tamano=101'],
      ['tamano = 0', '?tamano=0'],
      ['un parámetro desconocido', '?pagina=2'],
    ])('%s responde 400 VALIDACION', async (_caso, query) => {
      const res = await get(ids.principal, 'coordinador', query);
      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('VALIDACION');
    });

    it('sin sesión responde 401', async () => {
      const res = await request(app).get(`/api/v1/tickets/${ids.principal}/linea-tiempo`);
      expect(res.status).toBe(401);
    });

    it('no incluye el texto de los comentarios ni los datos de contacto del solicitante', async () => {
      for (const usuario of ['vecino', 'supervisor']) {
        const cuerpo = JSON.stringify((await get(ids.principal, usuario)).body);
        expect(cuerpo).not.toContain(COMENTARIO_PUBLICO);
        expect(cuerpo).not.toContain(NOTA_INTERNA);
        expect(cuerpo).not.toContain('@linea.test');
        expect(cuerpo).not.toContain('55557777');
        expect(cuerpo).not.toContain('2000000000000');
      }
    });
  });
});
