import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };
const fixture = (nombre: string) => readFileSync(path.join(__dirname, '../fixtures/archivos', nombre));

interface FilaBitacora {
  id: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  usuario_id: string | null;
  dependencia_id: string | null;
  detalle: { cambios?: Record<string, { antes: unknown; despues: unknown }>; datos?: Record<string, unknown> };
}

// Comentarios (SPEC 23) y adjuntos (SPEC 24) en la bitácora (SPEC 42), contra PostgreSQL.
describe('Bitácora de comentarios y adjuntos (SPEC 42)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let carpeta: string;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    carpeta = await mkdtemp(path.join(os.tmpdir(), 'vozmuni-bitacora-adjuntos-'));
    container = buildContainer(envDePrueba({ ADJUNTOS_DIR: carpeta }), { enviadorCorreo: sinCorreo });
    await container.prepararAlmacen();
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
      ['tecnico', 'tecnico', ids.obras],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave}@bitacora-comentarios.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${clave}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date(), dependencia_id: dependenciaId })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
    }
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  async function ticket(estado: EstadoTicket = 'en_proceso'): Promise<number> {
    const enTriage = estado === 'nueva' || estado === 'en_revision';
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        dependencia_id: enTriage ? null : ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: enTriage ? null : 'media',
        asignado_a: enTriage ? null : ids.tecnico,
      })
      .returning('id');
    return Number(fila.id);
  }

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const comentar = (id: number, quien: string, cuerpo: string, interno: boolean) =>
    request(app).post(`/api/v1/tickets/${id}/comentarios`).set(auth(quien)).send({ cuerpo, interno });

  // Los registros nuevos desde `desde` (el id máximo antes de actuar).
  const maximo = async () => Number((await db('bitacora').max({ maximo: 'id' }).first())?.maximo ?? 0);
  const registrosDesde = (desde: number): Promise<FilaBitacora[]> =>
    db('bitacora').where('id', '>', desde).orderBy('id').select('id', 'accion', 'entidad', 'entidad_id', 'usuario_id', 'dependencia_id', 'detalle');

  it('un comentario de 300 caracteres deja comentario.crear truncado, con interno y la dependencia de la queja', async () => {
    const id = await ticket();
    const desde = await maximo();
    const cuerpo = 'a'.repeat(300);

    const res = await comentar(id, 'tecnico', cuerpo, true);

    expect(res.status).toBe(201);
    expect(await registrosDesde(desde)).toEqual([
      expect.objectContaining({
        accion: 'comentario.crear',
        entidad: 'comentario',
        entidad_id: String(res.body.comentario.id),
        usuario_id: String(ids.tecnico),
        dependencia_id: String(ids.obras),
        detalle: { datos: { ticketId: id, interno: true, cuerpo: `${'a'.repeat(200)}…` } },
      }),
    ]);
  });

  it('editarlo deja comentario.editar con antes y después', async () => {
    const id = await ticket();
    const creado = await comentar(id, 'tecnico', 'Texto original', false);
    const desde = await maximo();

    const res = await request(app)
      .patch(`/api/v1/tickets/${id}/comentarios/${creado.body.comentario.id}`)
      .set(auth('tecnico'))
      .send({ cuerpo: 'Texto corregido' });

    expect(res.status).toBe(200);
    expect(await registrosDesde(desde)).toEqual([
      expect.objectContaining({
        accion: 'comentario.editar',
        entidad_id: String(creado.body.comentario.id),
        dependencia_id: String(ids.obras),
        detalle: {
          cambios: { cuerpo: { antes: 'Texto original', despues: 'Texto corregido' } },
          datos: { ticketId: id, interno: false },
        },
      }),
    ]);
  });

  it('un comentario del vecino lo registra como actor', async () => {
    const id = await ticket('en_proceso');
    const desde = await maximo();
    expect((await comentar(id, 'vecino', 'Sigue igual', false)).status).toBe(201);

    expect(await registrosDesde(desde)).toEqual([
      expect.objectContaining({ accion: 'comentario.crear', usuario_id: String(ids.vecino), detalle: { datos: { ticketId: id, interno: false, cuerpo: 'Sigue igual' } } }),
    ]);
  });

  it('un comentario rechazado (409 QUEJA_FINALIZADA) no deja nada', async () => {
    const id = await ticket('cerrada');
    const desde = await maximo();
    const res = await comentar(id, 'vecino', 'Hola', false);

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('QUEJA_FINALIZADA');
    expect(await registrosDesde(desde)).toEqual([]);
  });

  it('subir un adjunto deja adjunto.subir con el nombre, el tipo y el tamaño; descargar nada; borrarlo deja adjunto.borrar', async () => {
    const id = await ticket();
    const desde = await maximo();
    const pdf = fixture('documento.pdf');

    const subida = await request(app)
      .post(`/api/v1/tickets/${id}/adjuntos`)
      .set(auth('tecnico'))
      .field('interno', 'true')
      .attach('archivos', pdf, 'informe.pdf');
    expect(subida.status).toBe(201);
    const adjuntoId = subida.body.adjuntos[0].id;

    expect(await registrosDesde(desde)).toEqual([
      expect.objectContaining({
        accion: 'adjunto.subir',
        entidad: 'adjunto',
        entidad_id: String(adjuntoId),
        usuario_id: String(ids.tecnico),
        dependencia_id: String(ids.obras),
        detalle: {
          datos: { ticketId: id, nombre: 'informe.pdf', tipoMime: 'application/pdf', tamanoBytes: pdf.length, interno: true, origen: 'atencion' },
        },
      }),
    ]);

    const tras = await maximo();
    expect((await request(app).get(`/api/v1/tickets/${id}/adjuntos/${adjuntoId}/contenido`).set(auth('tecnico'))).status).toBe(200);
    expect(await registrosDesde(tras)).toEqual([]);

    expect((await request(app).delete(`/api/v1/tickets/${id}/adjuntos/${adjuntoId}`).set(auth('tecnico'))).status).toBe(204);
    expect(await registrosDesde(tras)).toEqual([
      expect.objectContaining({
        accion: 'adjunto.borrar',
        entidad_id: String(adjuntoId),
        dependencia_id: String(ids.obras),
        detalle: { datos: { ticketId: id, nombre: 'informe.pdf', interno: true } },
      }),
    ]);
  });
});
