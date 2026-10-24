import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DiscoAlmacenArchivos } from '../../../src/infrastructure/storage/disco-almacen-archivos';

async function leerTodo(flujo: NodeJS.ReadableStream): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of flujo) {
    partes.push(Buffer.from(parte as Buffer));
  }
  return Buffer.concat(partes);
}

// Todos los archivos bajo una carpeta, recursivo.
async function archivosEn(carpeta: string): Promise<string[]> {
  const entradas = await readdir(carpeta, { withFileTypes: true, recursive: true });
  return entradas.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe('DiscoAlmacenArchivos', () => {
  let raiz: string;
  let almacen: DiscoAlmacenArchivos;

  beforeEach(async () => {
    raiz = await mkdtemp(path.join(os.tmpdir(), 'vozmuni-almacen-'));
    almacen = new DiscoAlmacenArchivos(path.join(raiz, 'adjuntos'));
    await almacen.preparar();
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it('guardar y leer devuelve el mismo contenido, en una ruta aa/uuid', async () => {
    const contenido = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x0a, 0x0d]);

    const ruta = await almacen.guardar(contenido);

    expect(ruta).toMatch(/^[0-9a-f]{2}\/[0-9a-f-]{36}$/);
    expect(ruta.slice(0, 2)).toBe(ruta.slice(3, 5));
    expect(await leerTodo(await almacen.leer(ruta))).toEqual(contenido);
  });

  it('no deja archivos temporales', async () => {
    await almacen.guardar(Buffer.from('uno'));
    await almacen.guardar(Buffer.from('dos'));

    const archivos = await archivosEn(path.join(raiz, 'adjuntos'));
    expect(archivos).toHaveLength(2);
    expect(archivos.some((a) => a.includes('.tmp-'))).toBe(false);
  });

  it.each(['../x', '/etc/passwd', 'ab/../../secreto', 'AB/AB000000-0000-4000-8000-000000000000', ''])(
    'rechaza la ruta %p al leer y al borrar',
    async (ruta) => {
      await expect(almacen.leer(ruta)).rejects.toThrow(/Ruta de adjunto inválida/);
      await expect(almacen.borrar(ruta)).rejects.toThrow(/Ruta de adjunto inválida/);
    },
  );

  it('borrar dos veces no falla, y después leer falla', async () => {
    const ruta = await almacen.guardar(Buffer.from('contenido'));

    await almacen.borrar(ruta);
    await almacen.borrar(ruta);

    await expect(almacen.leer(ruta)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await archivosEn(path.join(raiz, 'adjuntos'))).toEqual([]);
  });

  it('preparar crea la carpeta si no existe', async () => {
    const nueva = new DiscoAlmacenArchivos(path.join(raiz, 'otra', 'carpeta'));
    await nueva.preparar();

    expect(await readdir(path.join(raiz, 'otra'))).toEqual(['carpeta']);
  });
});
