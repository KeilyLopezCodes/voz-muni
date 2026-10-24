import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.enviados.push(mensaje);
  }
}

describe('Triage del supervisor (SPEC 19)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    const [servicios] = await db('dependencias').insert({ nombre: 'Servicios Públicos' }).returning('id');
    const [cerrada] = await db('dependencias').insert({ nombre: 'Dependencia cerrada', activa: false }).returning('id');
    ids.obras = Number(obras.id);
    ids.servicios = Number(servicios.id);
    const categorias: [string, string, number, boolean][] = [
      ['baches', 'Baches', ids.obras, true],
      ['alumbrado', 'Alumbrado', ids.servicios, true],
      ['inactiva', 'Categoría inactiva', ids.obras, false],
      ['sinDependencia', 'Categoría de dependencia cerrada', Number(cerrada.id), true],
    ];
    for (const [clave, nombre, dependenciaId, activa] of categorias) {
      const [fila] = await db('categorias').insert({ nombre, dependencia_id: dependenciaId, activa }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const rol of ['supervisor', 'receptor', 'coordinador', 'tecnico', 'administrador', 'vecino']) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: rol === 'vecino' ? 'Ana López' : `Usuario ${rol}`,
          email: `${rol}@triage.test`,
          telefono: '55551234',
          dpi: rol === 'vecino' ? '2547123450101' : null,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: rol === 'coordinador' || rol === 'tecnico' ? ids.obras : null,
        })
        .returning('id');
      ids[rol] = Number(fila.id);
      const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@triage.test`, password: PASSWORD });
      tokens[rol] = res.body.accessToken;
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
    await db('ticket_historial').delete();
    await db('tickets').delete();
    enviador.enviados.length = 0;
  });

  async function nuevaQueja(titulo = 'Bache frente a la escuela'): Promise<number> {
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.vecino}`)
      .send({
        categoriaId: ids.baches,
        zonaId: ids.zona,
        titulo,
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  const transicion = (id: number, cuerpo: object, quien = 'supervisor') =>
    request(app).post(`/api/v1/tickets/${id}/transiciones`).set('Authorization', `Bearer ${tokens[quien]}`).send(cuerpo);
  const bandeja = (query = '', quien = 'supervisor') =>
    request(app).get(`/api/v1/tickets/triage${query}`).set('Authorization', `Bearer ${tokens[quien]}`);

  // Los correos salen sin esperar: espera a que llegue el de esa plantilla.
  async function correoCon(asunto: string): Promise<MensajeCorreo | undefined> {
    for (let intento = 0; intento < 100; intento++) {
      const correo = enviador.enviados.find((c) => c.asunto.startsWith(asunto));
      if (correo) return correo;
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
    return undefined;
  }

  const historial = (ticketId: number) =>
    db('ticket_historial')
      .where({ ticket_id: ticketId })
      .orderBy('id')
      .select('estado_anterior', 'estado_nuevo', 'usuario_id', 'motivo');

  it('el supervisor toma y acepta con prioridad alta: dependencia de la categoría y 2 filas de historial', async () => {
    const id = await nuevaQueja();

    const tomada = await transicion(id, { accion: 'tomar' });
    expect(tomada.status).toBe(200);
    expect(tomada.body).toMatchObject({ id, estado: 'en_revision', prioridad: null, dependenciaId: null });

    const aceptada = await transicion(id, { accion: 'aceptar', prioridad: 'alta' });
    expect(aceptada.status).toBe(200);
    expect(aceptada.body).toEqual({
      id,
      numero: expect.stringMatching(/^Q-\d{4}-\d{6}$/),
      estado: 'asignada',
      prioridad: 'alta',
      categoriaId: ids.baches,
      dependenciaId: ids.obras,
    });

    expect(await db('tickets').where({ id }).first('estado', 'prioridad', 'dependencia_id', 'vence_resolucion')).toEqual({
      estado: 'asignada',
      prioridad: 'alta',
      dependencia_id: String(ids.obras),
      vence_resolucion: null,
    });
    expect(await historial(id)).toEqual([
      { estado_anterior: null, estado_nuevo: 'nueva', usuario_id: String(ids.vecino), motivo: null },
      { estado_anterior: 'nueva', estado_nuevo: 'en_revision', usuario_id: String(ids.supervisor), motivo: null },
      { estado_anterior: 'en_revision', estado_nuevo: 'asignada', usuario_id: String(ids.supervisor), motivo: null },
    ]);

    const correo = await correoCon('VozMuni: tu queja');
    expect(correo).toMatchObject({ para: 'vecino@triage.test', asunto: `VozMuni: tu queja ${aceptada.body.numero} fue aceptada` });
    expect(correo!.texto).toContain('la enviamos a Dirección de Obras');
    expect(correo!.texto).toContain(`/consulta?numero=${aceptada.body.numero}`);
  });

  it('tomar no envía correo', async () => {
    const id = await nuevaQueja();
    await correoCon('VozMuni: recibimos tu queja');
    enviador.enviados.length = 0;

    expect((await transicion(id, { accion: 'tomar' })).status).toBe(200);
    await new Promise((resolver) => setTimeout(resolver, 150));

    expect(enviador.enviados).toEqual([]);
  });

  it('rechazar con motivo → 200, motivo recortado en el historial y correo con el motivo', async () => {
    const id = await nuevaQueja();
    await transicion(id, { accion: 'tomar' });

    const res = await transicion(id, { accion: 'rechazar', motivo: '  La dirección está fuera del municipio  ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'rechazada', dependenciaId: null });
    expect((await historial(id)).at(-1)).toEqual({
      estado_anterior: 'en_revision',
      estado_nuevo: 'rechazada',
      usuario_id: String(ids.supervisor),
      motivo: 'La dirección está fuera del municipio',
    });
    const correo = await correoCon(`VozMuni: tu queja ${res.body.numero} no fue aceptada`);
    expect(correo!.texto).toContain('\nLa dirección está fuera del municipio\n');
  });

  it('aceptar con otra categoría la cambia, deja la nota en el historial y conserva datos_extra', async () => {
    const id = await nuevaQueja();
    await db('tickets').where({ id }).update({ datos_extra: JSON.stringify({ profundidad: 30 }) });
    await transicion(id, { accion: 'tomar' });

    const res = await transicion(id, { accion: 'aceptar', prioridad: 'media', categoriaId: ids.alumbrado });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ categoriaId: ids.alumbrado, dependenciaId: ids.servicios });
    expect(await db('tickets').where({ id }).first('categoria_id', 'dependencia_id', 'datos_extra')).toEqual({
      categoria_id: String(ids.alumbrado),
      dependencia_id: String(ids.servicios),
      datos_extra: { profundidad: 30 },
    });
    expect((await historial(id)).at(-1)!.motivo).toBe('Categoría: Baches → Alumbrado');
    expect((await correoCon('VozMuni: tu queja'))!.texto).toContain('la enviamos a Servicios Públicos');
  });

  it.each(['inactiva', 'sinDependencia'])('aceptar con la categoría %s → 400 CATEGORIA_INVALIDA', async (categoria) => {
    const id = await nuevaQueja();
    await transicion(id, { accion: 'tomar' });

    const res = await transicion(id, { accion: 'aceptar', prioridad: 'media', categoriaId: ids[categoria] });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('CATEGORIA_INVALIDA');
    expect(await db('tickets').where({ id }).first('estado')).toEqual({ estado: 'en_revision' });
  });

  it('tomar dos veces → 409 TRANSICION_INVALIDA, y aceptar una nueva también', async () => {
    const id = await nuevaQueja();
    const otra = await nuevaQueja('Otra queja de prueba');
    await transicion(id, { accion: 'tomar' });

    const segunda = await transicion(id, { accion: 'tomar' });
    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('TRANSICION_INVALIDA');

    expect((await transicion(otra, { accion: 'aceptar', prioridad: 'alta' })).body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it.each([
    ['aceptar sin prioridad', { accion: 'aceptar' }, 'VALIDACION'],
    ['rechazar sin motivo', { accion: 'rechazar' }, 'VALIDACION'],
    ['una acción desconocida', { accion: 'cerrar' }, 'VALIDACION'],
    ['un campo de más', { accion: 'aceptar', prioridad: 'alta', dependenciaId: 1 }, 'VALIDACION'],
    ['una prioridad critica', { accion: 'aceptar', prioridad: 'critica' }, 'PRIORIDAD_INVALIDA'],
    ['un motivo en blanco', { accion: 'rechazar', motivo: '   ' }, 'MOTIVO_REQUERIDO'],
    ['un motivo de 1001 caracteres', { accion: 'rechazar', motivo: 'a'.repeat(1001) }, 'VALIDACION'],
  ])('%s → 400 %s', async (_caso, cuerpo, codigo) => {
    const id = await nuevaQueja();
    await transicion(id, { accion: 'tomar' });

    const res = await transicion(id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe(codigo);
  });

  it.each(['receptor', 'coordinador', 'tecnico', 'administrador', 'vecino'])(
    'el %s recibe 403 en los dos endpoints',
    async (quien) => {
      const id = await nuevaQueja();

      expect((await transicion(id, { accion: 'tomar' }, quien)).status).toBe(403);
      expect((await bandeja('', quien)).status).toBe(403);
    },
  );

  it('sin token responde 401, y un ticket inexistente 404', async () => {
    expect((await request(app).post('/api/v1/tickets/1/transiciones').send({ accion: 'tomar' })).status).toBe(401);
    const res = await transicion(999999, { accion: 'tomar' });
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('NO_ENCONTRADO');
  });

  it('dos tomar simultáneos: uno → 200, el otro → 409, y queda exactamente una transición', async () => {
    const id = await nuevaQueja();

    const respuestas = await Promise.all([transicion(id, { accion: 'tomar' }), transicion(id, { accion: 'tomar' })]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db('ticket_historial').where({ ticket_id: id, estado_nuevo: 'en_revision' })).toHaveLength(1);
  });

  it('GET /tickets/triage lista solo nueva y en_revision, la más antigua primero, filtra y pagina', async () => {
    const primera = await nuevaQueja('Primera queja');
    const segunda = await nuevaQueja('Segunda queja');
    const tercera = await nuevaQueja('Tercera queja');
    const aceptada = await nuevaQueja('Queja ya aceptada');
    await transicion(segunda, { accion: 'tomar' });
    await transicion(aceptada, { accion: 'tomar' });
    await transicion(aceptada, { accion: 'aceptar', prioridad: 'baja' });

    const todas = await bandeja();
    expect(todas.status).toBe(200);
    expect(todas.body).toMatchObject({ pagina: 1, tamano: 20, total: 3 });
    expect(todas.body.datos.map((t: { id: number }) => t.id)).toEqual([primera, segunda, tercera]);
    expect(todas.body.datos[0]).toEqual({
      id: primera,
      numero: expect.stringMatching(/^Q-\d{4}-\d{6}$/),
      estado: 'nueva',
      titulo: 'Primera queja',
      descripcion: 'Hay un bache profundo que daña los vehículos',
      categoria: { id: ids.baches, nombre: 'Baches' },
      zona: { id: ids.zona, nombre: 'Zona 1', tipo: 'zona' },
      direccion: '5a avenida 3-20, zona 1',
      canal: 'portal',
      datosExtra: {},
      ubicacion: null,
      solicitanteNombre: 'Ana López',
      creadoEn: expect.stringMatching(/Z$/),
    });
    const texto = JSON.stringify(todas.body);
    expect(texto).not.toContain('vecino@triage.test');
    expect(texto).not.toContain('55551234');
    expect(texto).not.toContain('2547123450101');

    const nuevas = await bandeja('?estado=nueva');
    expect(nuevas.body.datos.map((t: { id: number }) => t.id)).toEqual([primera, tercera]);
    expect((await bandeja('?estado=en_revision')).body.datos.map((t: { id: number }) => t.id)).toEqual([segunda]);

    const pagina2 = await bandeja('?pagina=2&tamano=2');
    expect(pagina2.body).toMatchObject({ pagina: 2, tamano: 2, total: 3 });
    expect(pagina2.body.datos.map((t: { id: number }) => t.id)).toEqual([tercera]);
  });

  it.each(['?estado=asignada', '?tamano=51', '?pagina=0', '?otro=1'])('GET /tickets/triage%s → 400', async (query) => {
    expect((await bandeja(query)).status).toBe(400);
  });
});
