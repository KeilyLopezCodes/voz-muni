import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

interface RegistroDto {
  id: number;
  accion: string;
  ticketNumero: string | null;
  usuario: { id: number; nombre: string; rol: string } | null;
  dependencia: { id: number; nombre: string } | null;
}

// GET /api/v1/bitacora y /acciones (SPEC 41) contra PostgreSQL, con registros insertados directamente.
describe('Consulta de la bitácora (SPEC 41)', () => {
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

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
      ['coordinador', 'coordinador', ids.obras],
      ['tecnico', 'tecnico', ids.obras],
      ['receptor', 'receptor', null],
      ['vecino', 'vecino', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave}@bitacora-api.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${clave}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date(), dependencia_id: dependenciaId })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
    }

    const [categoria] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    const [ticket] = await db('tickets')
      .insert({
        numero: 'Q-2026-000042',
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: categoria.id,
        zona_id: zona.id,
        canal: 'portal',
        titulo: 'Bache',
        descripcion: 'Un bache grande en la calle',
        direccion: '5a avenida',
      })
      .returning('id');
    ids.ticket = Number(ticket.id);

    // 2026-11-02T05:30Z es el 1 de noviembre a las 23:30 en Guatemala; los demás, el 2 o el 3.
    const fila = (accion: string, entidad: string, entidadId: string | null, usuarioId: number | null, dependenciaId: number | null, creadoEn: string) => ({
      accion,
      entidad,
      entidad_id: entidadId,
      usuario_id: usuarioId,
      dependencia_id: dependenciaId,
      creado_en: creadoEn,
      ip: usuarioId === null ? null : '10.0.0.7',
    });
    await db('bitacora').insert([
      fila('ticket.aceptar', 'ticket', String(ids.ticket), ids.supervisor, ids.obras, '2026-11-02T05:30:00.000Z'),
      fila('ticket.asignar', 'ticket', String(ids.ticket), ids.coordinador, ids.obras, '2026-11-02T16:00:00.000Z'),
      fila('ticket.escalar', 'ticket', String(ids.ticket), null, ids.obras, '2026-11-02T17:00:00.000Z'),
      fila('zona.editar', 'zona', '9', ids.administrador, null, '2026-11-02T18:00:00.000Z'),
      fila('dependencia.editar', 'dependencia', String(ids.agua), ids.administrador, ids.agua, '2026-11-02T19:00:00.000Z'),
      // Tres en el mismo milisegundo: el cursor no los repite ni los salta.
      fila('usuario.editar', 'usuario', '1', ids.administrador, null, '2026-11-03T15:00:00.123Z'),
      fila('usuario.editar', 'usuario', '2', ids.administrador, null, '2026-11-03T15:00:00.123Z'),
      fila('usuario.editar', 'usuario', '3', ids.administrador, null, '2026-11-03T15:00:00.123Z'),
    ]);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  const consultar = (quien: string, query = '') =>
    request(app).get(`/api/v1/bitacora?desde=2026-11-01&hasta=2026-11-03${query}`).set('Authorization', `Bearer ${tokens[quien]}`);
  const acciones = (res: { body: { datos: RegistroDto[] } }) => res.body.datos.map((r) => r.accion);

  it('el supervisor ve todos los registros, del más reciente al más antiguo', async () => {
    const res = await consultar('supervisor');
    expect(res.status).toBe(200);
    expect(acciones(res)).toEqual([
      'usuario.editar',
      'usuario.editar',
      'usuario.editar',
      'dependencia.editar',
      'zona.editar',
      'ticket.escalar',
      'ticket.asignar',
      'ticket.aceptar',
    ]);
    expect((await consultar('administrador')).body.datos).toHaveLength(8);
  });

  it('el coordinador solo ve su dependencia, sin las acciones globales', async () => {
    expect(acciones(await consultar('coordinador'))).toEqual(['ticket.escalar', 'ticket.asignar', 'ticket.aceptar']);
  });

  it('el técnico, el receptor y el vecino → 403; sin sesión → 401', async () => {
    for (const quien of ['tecnico', 'receptor', 'vecino']) {
      expect((await consultar(quien)).status).toBe(403);
    }
    expect((await request(app).get('/api/v1/bitacora')).status).toBe(401);
    expect((await request(app).get('/api/v1/bitacora/acciones').set('Authorization', `Bearer ${tokens.tecnico}`)).status).toBe(403);
  });

  it('las fechas se interpretan en Guatemala: hasta incluye el día completo', async () => {
    const soloEl1 = await request(app)
      .get('/api/v1/bitacora?desde=2026-11-01&hasta=2026-11-01')
      .set('Authorization', `Bearer ${tokens.supervisor}`);
    expect(acciones(soloEl1)).toEqual(['ticket.aceptar']);
    const soloEl2 = await request(app)
      .get('/api/v1/bitacora?desde=2026-11-02&hasta=2026-11-02')
      .set('Authorization', `Bearer ${tokens.supervisor}`);
    expect(acciones(soloEl2)).toEqual(['dependencia.editar', 'zona.editar', 'ticket.escalar', 'ticket.asignar']);
  });

  it('filtra por acción (repetible), entidad, usuario y número de queja', async () => {
    expect(acciones(await consultar('supervisor', '&accion=ticket.aceptar&accion=zona.editar'))).toEqual(['zona.editar', 'ticket.aceptar']);
    expect(acciones(await consultar('supervisor', '&entidad=dependencia'))).toEqual(['dependencia.editar']);
    expect(acciones(await consultar('supervisor', `&usuarioId=${ids.coordinador}`))).toEqual(['ticket.asignar']);
    expect(acciones(await consultar('supervisor', '&numero=q-2026-000042'))).toEqual(['ticket.escalar', 'ticket.asignar', 'ticket.aceptar']);
  });

  it('parámetros inválidos → 400: un rango de 93 días, una acción fuera del catálogo o un parámetro extra', async () => {
    const supervisor = { Authorization: `Bearer ${tokens.supervisor}` };
    expect((await request(app).get('/api/v1/bitacora?desde=2026-08-01&hasta=2026-11-01').set(supervisor)).status).toBe(400);
    expect((await consultar('supervisor', '&accion=sesion.renovar')).status).toBe(400);
    expect((await consultar('supervisor', '&otro=1')).status).toBe(400);
  });

  it('el cursor recorre todo sin repetir ni saltar, aun con registros del mismo milisegundo', async () => {
    const vistos: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await consultar('supervisor', `&tamano=2${cursor ? `&cursor=${cursor}` : ''}`);
      vistos.push(...res.body.datos.map((r: RegistroDto) => r.id));
      cursor = res.body.siguienteCursor;
    } while (cursor);
    expect(vistos).toHaveLength(8);
    expect(new Set(vistos).size).toBe(8);
  });

  it('trae ticketNumero de las quejas, usuario null para el sistema, la dependencia y la IP', async () => {
    const datos: (RegistroDto & { ip: string | null })[] = (await consultar('supervisor')).body.datos;
    const escalar = datos.find((r) => r.accion === 'ticket.escalar')!;
    expect(escalar).toMatchObject({ ticketNumero: 'Q-2026-000042', usuario: null, ip: null, dependencia: { id: ids.obras, nombre: 'Dirección de Obras' } });
    const asignar = datos.find((r) => r.accion === 'ticket.asignar')!;
    expect(asignar).toMatchObject({ usuario: { id: ids.coordinador, nombre: 'Usuario coordinador', rol: 'coordinador' }, ip: '10.0.0.7' });
    expect(datos.find((r) => r.accion === 'zona.editar')).toMatchObject({ ticketNumero: null, dependencia: null });
  });

  it('numero también trae los comentarios y adjuntos de la queja, con ticketNumero; el coordinador no ve la autenticación (SPEC 42)', async () => {
    const [comentario] = await db('comentarios')
      .insert({ ticket_id: ids.ticket, autor_id: ids.tecnico, cuerpo: 'Revisado', es_interno: true })
      .returning('id');
    const base = { ip: null, creado_en: '2026-11-05T16:00:00.000Z' };
    await db('bitacora').insert([
      {
        ...base,
        accion: 'comentario.crear',
        entidad: 'comentario',
        entidad_id: String(comentario.id),
        usuario_id: ids.tecnico,
        dependencia_id: ids.obras,
        detalle: JSON.stringify({ datos: { ticketId: ids.ticket, interno: true, cuerpo: 'Revisado' } }),
      },
      {
        ...base,
        accion: 'adjunto.subir',
        entidad: 'adjunto',
        entidad_id: '77',
        usuario_id: ids.tecnico,
        dependencia_id: ids.obras,
        detalle: JSON.stringify({ datos: { ticketId: ids.ticket, nombre: 'foto.jpg' } }),
      },
      // De otra queja: no entra en el filtro.
      {
        ...base,
        accion: 'comentario.crear',
        entidad: 'comentario',
        entidad_id: '999',
        usuario_id: ids.tecnico,
        dependencia_id: ids.obras,
        detalle: JSON.stringify({ datos: { ticketId: ids.ticket + 1000, interno: false } }),
      },
      { ...base, accion: 'sesion.iniciar', entidad: 'usuario', entidad_id: String(ids.coordinador), usuario_id: ids.coordinador, dependencia_id: null },
    ]);
    const consultaDel5 = (quien: string, query = '') =>
      request(app).get(`/api/v1/bitacora?desde=2026-11-01&hasta=2026-11-05${query}`).set('Authorization', `Bearer ${tokens[quien]}`);

    const porNumero: RegistroDto[] = (await consultaDel5('supervisor', '&numero=Q-2026-000042')).body.datos;
    expect(porNumero.map((r) => [r.accion, r.ticketNumero])).toEqual([
      ['adjunto.subir', 'Q-2026-000042'],
      ['comentario.crear', 'Q-2026-000042'],
      ['ticket.escalar', 'Q-2026-000042'],
      ['ticket.asignar', 'Q-2026-000042'],
      ['ticket.aceptar', 'Q-2026-000042'],
    ]);

    const delCoordinador = acciones(await consultaDel5('coordinador'));
    expect(delCoordinador).toContain('comentario.crear');
    expect(delCoordinador).not.toContain('sesion.iniciar');
    expect(acciones(await consultaDel5('supervisor', '&accion=sesion.iniciar'))).toEqual(['sesion.iniciar']);
  });

  it('GET /bitacora/acciones devuelve el catálogo con su entidad', async () => {
    const res = await request(app).get('/api/v1/bitacora/acciones').set('Authorization', `Bearer ${tokens.coordinador}`);
    expect(res.status).toBe(200);
    expect(res.body.datos).toContainEqual({ accion: 'ticket.aceptar', entidad: 'ticket' });
    expect(res.body.datos).toContainEqual({ accion: 'politica_sla.reemplazar', entidad: 'categoria' });
  });
});
