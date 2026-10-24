import yauzl from 'yauzl';
import type { InspectorDocx } from '../../domain/adjuntos/inspector-docx';

const CONTENT_TYPES = '[Content_Types].xml';
// [Content_Types].xml es pequeño; un tope evita leer en memoria una entrada enorme de un ZIP malicioso.
const MAX_CONTENT_TYPES = 1024 * 1024;

// Un DOCX es un ZIP cuyo [Content_Types].xml declara partes de wordprocessingml (SPEC 24).
export class ZipInspectorDocx implements InspectorDocx {
  esDocx(contenido: Uint8Array): Promise<boolean> {
    return new Promise((resolver) => {
      yauzl.fromBuffer(Buffer.from(contenido), { lazyEntries: true }, (error, zip) => {
        if (error || !zip) {
          resolver(false);
          return;
        }
        let resuelto = false;
        const terminar = (valor: boolean) => {
          if (!resuelto) {
            resuelto = true;
            zip.close();
            resolver(valor);
          }
        };
        zip.on('error', () => terminar(false));
        zip.on('end', () => terminar(false));
        zip.on('entry', (entrada: yauzl.Entry) => {
          if (entrada.fileName !== CONTENT_TYPES || entrada.uncompressedSize > MAX_CONTENT_TYPES) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entrada, (errorLectura, flujo) => {
            if (errorLectura || !flujo) {
              terminar(false);
              return;
            }
            const partes: Buffer[] = [];
            flujo.on('data', (parte: Buffer) => partes.push(parte));
            flujo.on('error', () => terminar(false));
            flujo.on('end', () => terminar(Buffer.concat(partes).toString('utf8').includes('wordprocessingml')));
          });
        });
        zip.readEntry();
      });
    });
  }
}
