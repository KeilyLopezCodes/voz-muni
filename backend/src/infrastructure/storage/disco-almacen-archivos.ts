import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AlmacenArchivos } from '../../domain/adjuntos/almacen-archivos';

// Solo rutas que el propio almacén generó: así nadie recorre otras carpetas con `../`.
const PATRON_RUTA = /^[0-9a-f]{2}\/[0-9a-f-]{36}$/;

// Adjuntos en disco (SPEC 24): ADJUNTOS_DIR/<aa>/<uuid>, donde aa son los dos primeros caracteres del UUID, para no
// tener una sola carpeta enorme. Esta carpeta nunca se sirve como estática: se descarga por la API con permisos.
export class DiscoAlmacenArchivos implements AlmacenArchivos {
  private readonly raiz: string;

  constructor(raiz: string) {
    this.raiz = path.resolve(raiz);
  }

  // El backend la crea al arrancar si no existe.
  async preparar(): Promise<void> {
    await mkdir(this.raiz, { recursive: true });
  }

  async guardar(contenido: Buffer): Promise<string> {
    const uuid = randomUUID();
    const ruta = `${uuid.slice(0, 2)}/${uuid}`;
    const destino = this.absoluta(ruta);
    await mkdir(path.dirname(destino), { recursive: true });
    // Primero a un temporal y luego se renombra: un fallo a mitad de la escritura no deja un archivo parcial.
    const temporal = `${destino}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporal, contenido, { flag: 'wx' });
      await rename(temporal, destino);
    } catch (error) {
      await rm(temporal, { force: true });
      throw error;
    }
    return ruta;
  }

  async leer(ruta: string): Promise<NodeJS.ReadableStream> {
    const archivo = this.absoluta(ruta);
    await access(archivo);
    return createReadStream(archivo);
  }

  async borrar(ruta: string): Promise<void> {
    await rm(this.absoluta(ruta), { force: true });
  }

  private absoluta(ruta: string): string {
    if (!PATRON_RUTA.test(ruta)) {
      throw new Error(`Ruta de adjunto inválida: ${JSON.stringify(ruta)}`);
    }
    return path.join(this.raiz, ...ruta.split('/'));
  }
}
