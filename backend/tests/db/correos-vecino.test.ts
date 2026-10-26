import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { Clock } from '../../src/domain/health/clock';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';
import { prepararSla } from './sla-fixtures';

const PASSWORD = 'Clave-de-prueba-1';
const MINUTO = 60_000;
const VECINO_EMAIL = 'vecino@correos-vecino.test';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

// La hora real más un desfase: los comentarios "a los 5 minutos" sin salir del plazo del token de acceso.
class RelojAjustable implements Clock {
  desfaseMs = 0;

  now(): Date {
    return new Date(Date.now() + this.desfaseMs);
  }
}

// Los 4 correos nuevos al vecino (SPEC 35) contra PostgreSQL, con el primer envío sincrónico de las pruebas (SPEC 34).
describe('Correos nuevos al vecino (SPEC 35)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  const reloj = new RelojAjustable();
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador, reloj });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre, activa: true }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    await prepararSla(db, [ids.baches]);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['tecnico', 'tecnico', ids.obras],
      ['otroTecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['supervisor', 'supervisor', null],
      ['vecino', 'vecino', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = clave === 'vecino' ? VECINO_EMAIL : `${clave.toLowerCase()}@correos-vecino.test`;
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
    }
    // Un vecino de ventanilla sin correo (SPEC 13).
    const { id: rolVecino } = await db('roles').where({ nombre: 'vecino' }).first('id');
    const [sinCorreo] = await db('usuarios')
      .insert({ nombre: 'Vecino sin correo', telefono: '55550000', dpi: '1234567890101', rol_id: rolVecino })
      .returning('id');
    ids.vecinoSinCorreo = Number(sinCorreo.id);
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
    enviador.enviados.length = 0;
    reloj.desfaseMs = 0;
    await db('tickets').update({ avisos_comentario_pendientes: 0 });
  });

  afterEach(() => jest.restoreAllMocks());

  async function ticket(
    estado: EstadoTicket,
    { asignadoA = ids.tecnico as number | null, solicitante = ids.vecino } = {},
  ): Promise<{ id: number; numero: string }> {
    const numero = `Q-2026-${String(correlativo++).padStart(6, '0')}`;
    const [fila] = await db('tickets')
      .insert({
        numero,
        solicitante_id: solicitante,
        registrado_por: solicitante,
        categoria_id: ids.baches,
        dependencia_id: estado === 'en_revision' ? null : ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Un bache grande que ya dañó dos carros',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: estado === 'en_revision' ? null : 'media',
        asignado_a: asignadoA,
      })
      .returning('id');
    return { id: Number(fila.id), numero };
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const transicion = (id: number, cuerpo: object, quien: string) =>
    request(app).post(`/api/v1/tickets/${id}/transiciones`).set(auth(quien)).send(cuerpo);
  const comentar = (id: number, cuerpo: string, quien = 'tecnico', interno = false) =>
    request(app).post(`/api/v1/tickets/${id}/comentarios`).set(auth(quien)).send({ cuerpo, interno });
  const asignar = (id: number, cuerpo: object, quien = 'coordinador') =>
    request(app).patch(`/api/v1/tickets/${id}/asignacion`).set(auth(quien)).send(cuerpo);
  const plantillasDe = async (ticketId: number): Promise<string[]> =>
    (await db('correos_salientes').where({ ticket_id: ticketId }).orderBy('id').select('plantilla_clave')).map(
      (f: { plantilla_clave: string }) => f.plantilla_clave,
    );
  const estadoAviso = (ticketId: number) =>
    db('tickets').where({ id: ticketId }).first('aviso_comentario_en', 'avisos_comentario_pendientes');

  describe('informacion_solicitada (poner_en_espera)', () => {
    it('envía la información pedida, escapada en el html, con el enlace a la consulta', async () => {
      const { id, numero } = await ticket('en_proceso');

      const res = await transicion(id, { accion: 'poner_en_espera', motivo: '  Una foto de <la> fuga  ' }, 'tecnico');

      expect(res.status).toBe(200);
      expect(enviador.enviados).toHaveLength(1);
      const [correo] = enviador.enviados;
      expect(correo).toMatchObject({ para: VECINO_EMAIL, asunto: `VozMuni: necesitamos información sobre tu queja ${numero}` });
      expect(correo.texto).toContain('\nUna foto de <la> fuga\n');
      expect(correo.texto).toContain(`http://localhost:5173/consulta?numero=${numero}`);
      expect(correo.html).toContain('Una foto de &lt;la&gt; fuga');
      expect(await db('correos_salientes').where({ ticket_id: id }).first('plantilla_clave', 'usuario_id', 'estado')).toEqual({
        plantilla_clave: 'informacion_solicitada',
        usuario_id: String(ids.vecino),
        estado: 'enviado',
      });
    });

    it('un solicitante sin correo no recibe nada, y una transición rechazada (409) no deja correo', async () => {
      const sinCorreo = await ticket('en_proceso', { solicitante: ids.vecinoSinCorreo });
      expect((await transicion(sinCorreo.id, { accion: 'poner_en_espera', motivo: 'Una foto' }, 'tecnico')).status).toBe(200);

      const asignada = await ticket('asignada');
      expect((await transicion(asignada.id, { accion: 'poner_en_espera', motivo: 'Una foto' }, 'tecnico')).status).toBe(409);

      expect(enviador.enviados).toEqual([]);
      expect(await plantillasDe(sinCorreo.id)).toEqual([]);
      expect(await plantillasDe(asignada.id)).toEqual([]);
    });
  });

  describe('queja_trasladada', () => {
    const solicitar = (id: number, quien: string) =>
      request(app).post(`/api/v1/tickets/${id}/traslados`).set(auth(quien)).send({ motivo: 'Es una fuga, motivo interno' });
    const decidir = (solicitudId: number, accion: string, quien = 'supervisor', cuerpo: object = {}) =>
      request(app).post(`/api/v1/traslados/${solicitudId}/${accion}`).set(auth(quien)).send(cuerpo);

    it('aprobar una solicitud avisa al vecino sin el motivo; la solicitud pendiente no', async () => {
      const { id, numero } = await ticket('en_proceso');
      const solicitud = await solicitar(id, 'tecnico');
      expect(solicitud.status).toBe(201);
      expect(enviador.enviados).toEqual([]);

      expect((await decidir(solicitud.body.solicitud.id, 'aprobacion')).status).toBe(200);

      expect(enviador.enviados).toHaveLength(1);
      const [correo] = enviador.enviados;
      expect(correo.asunto).toBe(`VozMuni: tu queja ${numero} cambió de área`);
      expect(correo.texto).toContain(`consulta?numero=${numero}`);
      expect(correo.texto).not.toContain('motivo interno');
      expect(correo.texto).not.toContain('Dirección de Obras');
      expect(await plantillasDe(id)).toEqual(['queja_trasladada']);
    });

    it('el traslado directo del supervisor avisa al vecino', async () => {
      const { id } = await ticket('asignada');
      expect((await solicitar(id, 'supervisor')).status).toBe(200);
      expect(await plantillasDe(id)).toEqual(['queja_trasladada']);
    });

    it('rechazar o retirar una solicitud no envía nada', async () => {
      const rechazada = await ticket('en_proceso');
      const primera = await solicitar(rechazada.id, 'tecnico');
      expect((await decidir(primera.body.solicitud.id, 'rechazo', 'supervisor', { motivo: 'Es un bache' })).status).toBe(200);

      const retirada = await ticket('en_proceso');
      const segunda = await solicitar(retirada.id, 'tecnico');
      expect((await decidir(segunda.body.solicitud.id, 'retiro', 'tecnico')).status).toBe(200);

      expect(enviador.enviados).toEqual([]);
      expect(await plantillasDe(rechazada.id)).toEqual([]);
      expect(await plantillasDe(retirada.id)).toEqual([]);
    });
  });

  describe('tecnico_asignado', () => {
    it('la primera asignación avisa con la dependencia y sin el técnico; una reasignación no', async () => {
      const { id, numero } = await ticket('asignada', { asignadoA: null });

      expect((await asignar(id, { tecnicoId: ids.tecnico })).status).toBe(200);
      expect(enviador.enviados).toHaveLength(1);
      const [correo] = enviador.enviados;
      expect(correo.asunto).toBe(`VozMuni: ya atendemos tu queja ${numero}`);
      expect(correo.texto).toContain('Un técnico de Dirección de Obras ya está atendiendo');
      expect(correo.texto).not.toContain('Usuario tecnico');

      expect((await asignar(id, { tecnicoId: ids.otroTecnico, motivo: 'Cambio de turno' })).status).toBe(200);
      expect(enviador.enviados).toHaveLength(1);
      expect(await plantillasDe(id)).toEqual(['tecnico_asignado']);
    });

    it('después de un traslado, volver a aceptar y asignar avisa de nuevo', async () => {
      const { id } = await ticket('asignada', { asignadoA: null });
      await asignar(id, { tecnicoId: ids.tecnico });
      expect((await request(app).post(`/api/v1/tickets/${id}/traslados`).set(auth('supervisor')).send({ motivo: 'Revisar' })).status).toBe(200);
      expect((await transicion(id, { accion: 'aceptar', prioridad: 'media' }, 'supervisor')).status).toBe(200);

      expect((await asignar(id, { tecnicoId: ids.otroTecnico })).status).toBe(200);

      expect(await plantillasDe(id)).toEqual(['tecnico_asignado', 'queja_trasladada', 'queja_aceptada', 'tecnico_asignado']);
    });
  });

  describe('avisos de comentarios públicos', () => {
    it('el primero envía comentario_publico sin el texto; dos más a los 5 y 10 minutos se acumulan', async () => {
      const { id, numero } = await ticket('en_proceso');

      expect((await comentar(id, 'Mañana llevamos la máquina')).status).toBe(201);
      expect(enviador.enviados).toHaveLength(1);
      expect(enviador.enviados[0].asunto).toBe(`VozMuni: tienes un comentario nuevo en tu queja ${numero}`);
      expect(enviador.enviados[0].texto).not.toContain('máquina');
      expect(enviador.enviados[0].html).not.toContain('máquina');

      reloj.desfaseMs = 5 * MINUTO;
      await comentar(id, 'Ya vamos en camino');
      reloj.desfaseMs = 10 * MINUTO;
      await comentar(id, 'Llegamos');

      expect(enviador.enviados).toHaveLength(1);
      expect((await estadoAviso(id)).avisos_comentario_pendientes).toBe(2);
    });

    it('una nota interna, un comentario del vecino y una edición no cuentan', async () => {
      const { id } = await ticket('en_proceso');

      await comentar(id, 'Llevar pala', 'tecnico', true);
      await comentar(id, '¿Cuándo vienen?', 'vecino');
      expect(enviador.enviados).toEqual([]);
      expect(await estadoAviso(id)).toEqual({ aviso_comentario_en: null, avisos_comentario_pendientes: 0 });

      const publico = await comentar(id, 'Mañana');
      await request(app)
        .patch(`/api/v1/tickets/${id}/comentarios/${publico.body.comentario.id}`)
        .set(auth('tecnico'))
        .send({ cuerpo: 'Pasado mañana' });

      expect(enviador.enviados).toHaveLength(1);
      expect((await estadoAviso(id)).avisos_comentario_pendientes).toBe(0);
    });

    it('dos comentarios simultáneos fuera de la ventana envían un solo aviso', async () => {
      const { id } = await ticket('en_proceso');

      const respuestas = await Promise.all([comentar(id, 'Uno'), comentar(id, 'Dos', 'coordinador')]);

      expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
      expect(await plantillasDe(id)).toEqual(['comentario_publico']);
      expect((await estadoAviso(id)).avisos_comentario_pendientes).toBe(1);
    });

    it('con el parámetro inválido avisa al instante y registra el error', async () => {
      const errores = jest.spyOn(console, 'error').mockImplementation(() => {});
      await db('parametros').where({ clave: 'aviso_comentarios_ventana_minutos' }).update({ valor: JSON.stringify('treinta') });
      try {
        const { id } = await ticket('en_proceso');
        await comentar(id, 'Uno');
        await comentar(id, 'Dos');

        expect(await plantillasDe(id)).toEqual(['comentario_publico', 'comentario_publico']);
        expect(errores.mock.calls.map(([m]) => String(m))).toContainEqual(expect.stringContaining('aviso_comentarios_ventana_minutos'));
      } finally {
        await db('parametros').where({ clave: 'aviso_comentarios_ventana_minutos' }).update({ valor: JSON.stringify(30) });
      }
    });

    it('el job encola el agrupado al cerrarse la ventana, con la cantidad, y reinicia el estado', async () => {
      const { id, numero } = await ticket('en_proceso');
      await comentar(id, 'Uno');
      reloj.desfaseMs = 5 * MINUTO;
      await comentar(id, 'Dos');
      await comentar(id, 'Tres');
      const { aviso_comentario_en: primerAviso } = await estadoAviso(id);

      const avisos = container.avisosComentariosService;
      expect(await avisos.procesar(new Date(primerAviso.getTime() + 29 * MINUTO))).toBe(0);
      const cierre = new Date(primerAviso.getTime() + 30 * MINUTO);
      expect(await avisos.procesar(cierre)).toBe(1);

      expect(enviador.enviados.at(-1)!.asunto).toBe(`VozMuni: tienes 2 comentarios nuevos en tu queja ${numero}`);
      expect(enviador.enviados.at(-1)!.texto).toContain('dejó 2 comentarios');
      expect(enviador.enviados.at(-1)!.texto).not.toContain('Tres');
      expect(await estadoAviso(id)).toEqual({ aviso_comentario_en: cierre, avisos_comentario_pendientes: 0 });
      expect(await plantillasDe(id)).toEqual(['comentario_publico', 'comentarios_publicos_agrupados']);
    });

    it('dos corridas simultáneas del job encolan un solo agrupado', async () => {
      const { id } = await ticket('en_proceso');
      await db('tickets')
        .where({ id })
        .update({ aviso_comentario_en: new Date(Date.now() - 60 * MINUTO), avisos_comentario_pendientes: 3 });

      const avisos = container.avisosComentariosService;
      const [a, b] = await Promise.all([avisos.procesar(new Date()), avisos.procesar(new Date())]);

      expect(a + b).toBe(1);
      expect(await plantillasDe(id)).toEqual(['comentarios_publicos_agrupados']);
      expect(enviador.enviados.at(-1)!.asunto).toContain('tienes 3 comentarios nuevos');
    });
  });
});
