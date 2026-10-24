import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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

// Todos los archivos guardados bajo la carpeta de adjuntos de la prueba.
async function archivosEnDisco(carpeta: string): Promise<string[]> {
  try {
    const entradas = await readdir(carpeta, { withFileTypes: true, recursive: true });
    return entradas.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
  } catch {
    return [];
  }
}

describe('Adjuntos (SPEC 24)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let carpeta: string;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    carpeta = await mkdtemp(path.join(os.tmpdir(), 'vozmuni-adjuntos-'));
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
      ['otroVecino', 'vecino', null],
      ['receptor', 'receptor', null],
      ['tecnico', 'tecnico', ids.obras],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${clave}`,
          email: `${clave.toLowerCase()}@adjuntos.test`,
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[clave] = Number(fila.id);
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${clave.toLowerCase()}@adjuntos.test`, password: PASSWORD });
      tokens[clave] = res.body.accessToken;
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

  async function ticket(estado: EstadoTicket = 'nueva', registradoPor = ids.vecino, solicitante = ids.vecino): Promise<number> {
    const enTriage = estado === 'nueva' || estado === 'en_revision';
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: solicitante,
        registrado_por: registradoPor,
        categoria_id: ids.baches,
        dependencia_id: enTriage ? null : ids.obras,
        zona_id: ids.zona,
        canal: registradoPor === solicitante ? 'portal' : 'telefono',
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
  function subir(id: number, quien: string, archivos: [string, string?][], interno?: 'true' | 'false') {
    const peticion = request(app).post(`/api/v1/tickets/${id}/adjuntos`).set(auth(quien));
    if (interno) peticion.field('interno', interno);
    for (const [fixtureNombre, nombre] of archivos) {
      peticion.attach('archivos', fixture(fixtureNombre), nombre ?? fixtureNombre);
    }
    return peticion;
  }
  const listar = (id: number, quien: string) => request(app).get(`/api/v1/tickets/${id}/adjuntos`).set(auth(quien));
  const descargar = (id: number, adjuntoId: number, quien: string) =>
    request(app)
      .get(`/api/v1/tickets/${id}/adjuntos/${adjuntoId}/contenido`)
      .set(auth(quien))
      .buffer(true)
      .parse((res, callback) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => callback(null, Buffer.concat(partes)));
      });
  const borrar = (id: number, adjuntoId: number, quien: string) =>
    request(app).delete(`/api/v1/tickets/${id}/adjuntos/${adjuntoId}`).set(auth(quien));

  it('el vecino sube 3 a su queja nueva → 201 de registro y públicos; 3 más → 409 LIMITE_ADJUNTOS sin guardar; luego ADJUNTOS_CERRADOS', async () => {
    const id = await ticket();
    const antes = (await archivosEnDisco(carpeta)).length;

    const res = await subir(id, 'vecino', [['foto.jpg', 'foto del bache.jpg'], ['imagen.png'], ['documento.pdf', 'Señal rota.pdf']]);

    expect(res.status).toBe(201);
    expect(res.body.adjuntos).toHaveLength(3);
    expect(res.body.adjuntos[0]).toEqual({
      id: expect.any(Number),
      nombre: 'foto del bache.jpg',
      mime: 'image/jpeg',
      tamanoBytes: fixture('foto.jpg').length,
      interno: false,
      origen: 'registro',
      subidoPor: { id: ids.vecino, nombre: 'Usuario vecino', rol: 'vecino' },
      creadoEn: expect.stringMatching(/Z$/),
      borrable: true,
    });
    expect(res.body.adjuntos[2].nombre).toBe('Señal rota.pdf');
    expect(JSON.stringify(res.body)).not.toMatch(/"ruta"/);
    expect((await archivosEnDisco(carpeta)).length).toBe(antes + 3);

    const excede = await subir(id, 'vecino', [['foto.jpg'], ['foto.jpg'], ['foto.jpg']]);
    expect(excede.status).toBe(409);
    expect(excede.body).toMatchObject({ codigo: 'LIMITE_ADJUNTOS', detalles: [{ campo: 'restantes', problema: '2' }] });
    expect(await db('adjuntos').where({ ticket_id: id })).toHaveLength(3);
    expect((await archivosEnDisco(carpeta)).length).toBe(antes + 3);

    await db('tickets').where({ id }).update({ estado: 'en_revision' });
    const cerrado = await subir(id, 'vecino', [['foto.jpg']]);
    expect(cerrado.status).toBe(409);
    expect(cerrado.body.codigo).toBe('ADJUNTOS_CERRADOS');
  });

  it('el receptor que registró en ventanilla sube mientras está en nueva → origen registro', async () => {
    const id = await ticket('nueva', ids.receptor);

    const res = await subir(id, 'receptor', [['documento.pdf']]);

    expect(res.status).toBe(201);
    expect(res.body.adjuntos[0]).toMatchObject({ origen: 'registro', interno: false });
  });

  it('el técnico sube una evidencia interna y una pública; el vecino ve solo la pública y no puede descargar la interna', async () => {
    const id = await ticket('en_proceso');

    const interna = await subir(id, 'tecnico', [['informe.docx']], 'true');
    const publica = await subir(id, 'tecnico', [['foto.jpg', 'arreglo.jpg']], 'false');
    expect(interna.status).toBe(201);
    expect(publica.status).toBe(201);
    expect(interna.body.adjuntos[0]).toMatchObject({ origen: 'atencion', interno: true });

    const delVecino = await listar(id, 'vecino');
    expect(delVecino.status).toBe(200);
    expect(delVecino.body.datos.map((a: { nombre: string }) => a.nombre)).toEqual(['arreglo.jpg']);
    expect((await descargar(id, interna.body.adjuntos[0].id, 'vecino')).status).toBe(404);
    expect((await listar(id, 'tecnico')).body.datos).toHaveLength(2);
  });

  it('la descarga devuelve el mismo contenido con nosniff, no-store y la disposición correcta', async () => {
    const id = await ticket('en_proceso');
    const [jpg, pdf] = (await subir(id, 'tecnico', [['foto.jpg', 'foto.jpg'], ['documento.pdf', 'Informe técnico.pdf']], 'false')).body
      .adjuntos;

    const imagen = await descargar(id, jpg.id, 'vecino');
    expect(imagen.status).toBe(200);
    expect(Buffer.compare(imagen.body as Buffer, fixture('foto.jpg'))).toBe(0);
    expect(imagen.headers['content-type']).toBe('image/jpeg');
    expect(imagen.headers['content-disposition']).toMatch(/^inline; filename="foto.jpg"/);
    expect(imagen.headers['x-content-type-options']).toBe('nosniff');
    expect(imagen.headers['cache-control']).toBe('private, no-store');

    const documento = await descargar(id, pdf.id, 'tecnico');
    expect(Buffer.compare(documento.body as Buffer, fixture('documento.pdf'))).toBe(0);
    expect(documento.headers['content-disposition']).toBe(
      `attachment; filename="Informe t_cnico.pdf"; filename*=UTF-8''${encodeURIComponent('Informe técnico.pdf')}`,
    );
  });

  it('un .exe renombrado → 400 ADJUNTO_INVALIDO, sin archivos en disco', async () => {
    const id = await ticket();
    const antes = (await archivosEnDisco(carpeta)).length;

    const res = await subir(id, 'vecino', [['documento.pdf'], ['programa.exe', 'factura.pdf']]);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ codigo: 'ADJUNTO_INVALIDO', detalles: [{ campo: 'factura.pdf', problema: 'CONTENIDO_NO_COINCIDE' }] });
    expect(await db('adjuntos').where({ ticket_id: id })).toEqual([]);
    expect((await archivosEnDisco(carpeta)).length).toBe(antes);
  });

  it('un archivo de 11 MB → 400 ADJUNTO_INVALIDO MUY_GRANDE', async () => {
    const id = await ticket();
    const grande = Buffer.alloc(11 * 1024 * 1024);
    grande.set([0x25, 0x50, 0x44, 0x46, 0x2d]);

    const res = await request(app).post(`/api/v1/tickets/${id}/adjuntos`).set(auth('vecino')).attach('archivos', grande, 'grande.pdf');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ codigo: 'ADJUNTO_INVALIDO', detalles: [{ problema: 'MUY_GRANDE' }] });
  });

  it('6 archivos en una petición → 400, y ninguno → 400', async () => {
    const id = await ticket();

    expect((await subir(id, 'vecino', Array.from({ length: 6 }, () => ['foto.jpg'] as [string]))).status).toBe(400);
    const vacio = await request(app).post(`/api/v1/tickets/${id}/adjuntos`).set(auth('vecino')).field('interno', 'false');
    expect(vacio.status).toBe(400);
    expect(vacio.body.codigo).toBe('VALIDACION');
  });

  it('un adjunto de registro con interno=true → 400 VALIDACION', async () => {
    const id = await ticket();

    const res = await subir(id, 'vecino', [['foto.jpg']], 'true');

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDACION');
  });

  it('el autor borra a los 2 minutos → 204 y el archivo desaparece; pasados 5 minutos → 409; otro usuario → 404', async () => {
    const id = await ticket('en_proceso');
    const [primero, segundo] = (await subir(id, 'tecnico', [['foto.jpg'], ['imagen.png']], 'true')).body.adjuntos;
    await db('adjuntos').where({ id: primero.id }).update({ creado_en: new Date(Date.now() - 2 * 60_000) });
    const antes = (await archivosEnDisco(carpeta)).length;

    expect((await borrar(id, primero.id, 'supervisor')).status).toBe(404);
    expect((await borrar(id, primero.id, 'tecnico')).status).toBe(204);
    expect(await db('adjuntos').where({ id: primero.id })).toEqual([]);
    expect((await archivosEnDisco(carpeta)).length).toBe(antes - 1);

    await db('adjuntos').where({ id: segundo.id }).update({ creado_en: new Date(Date.now() - 5 * 60_000 - 1000) });
    const vencido = await borrar(id, segundo.id, 'tecnico');
    expect(vencido.status).toBe(409);
    expect(vencido.body.codigo).toBe('EDICION_VENCIDA');
  });

  it('una queja ajena → 404, sin token → 401, y el administrador no puede subir', async () => {
    const ajena = await ticket('nueva', ids.otroVecino, ids.otroVecino);

    expect((await subir(ajena, 'vecino', [['foto.jpg']])).status).toBe(404);
    expect((await listar(ajena, 'vecino')).status).toBe(404);
    expect((await request(app).get(`/api/v1/tickets/${ajena}/adjuntos`)).status).toBe(401);
    const enProceso = await ticket('en_proceso');
    expect((await subir(enProceso, 'administrador', [['foto.jpg']], 'false')).status).toBe(403);
  });

  it('en una queja cerrada, un público → 409 QUEJA_FINALIZADA y un interno → 201', async () => {
    const id = await ticket('cerrada');

    const publico = await subir(id, 'supervisor', [['foto.jpg']], 'false');
    expect(publico.status).toBe(409);
    expect(publico.body.codigo).toBe('QUEJA_FINALIZADA');
    expect((await subir(id, 'supervisor', [['foto.jpg']], 'true')).status).toBe(201);
  });

  it('un adjunto de otro ticket → 404 al descargar y al borrar', async () => {
    const id = await ticket('en_proceso');
    const otro = await ticket('en_proceso');
    const [adjunto] = (await subir(id, 'tecnico', [['foto.jpg']], 'false')).body.adjuntos;

    expect((await descargar(otro, adjunto.id, 'tecnico')).status).toBe(404);
    expect((await borrar(otro, adjunto.id, 'tecnico')).status).toBe(404);
  });
});
