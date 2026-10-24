import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  limpiarNombre,
  problemaDeArchivo,
  TAMANO_MAXIMO,
  validarArchivos,
} from '../../../src/domain/adjuntos/tipo-archivo';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import { ZipInspectorDocx } from '../../../src/infrastructure/storage/zip-inspector-docx';

const fixture = (nombre: string) => readFileSync(path.join(__dirname, '../../fixtures/archivos', nombre));
const inspector = new ZipInspectorDocx();

describe('problemaDeArchivo', () => {
  it.each([
    ['documento.pdf', 'documento.pdf', 'application/pdf'],
    ['foto.jpg', 'foto.jpg', 'image/jpeg'],
    ['foto.jpg', 'FOTO.JPEG', 'image/jpeg'],
    ['imagen.png', 'imagen.png', 'image/png'],
    ['informe.docx', 'informe.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('%s subido como %s es válido con el MIME %s', async (archivo, nombre, mime) => {
    expect(await problemaDeArchivo(nombre, fixture(archivo), inspector)).toEqual({
      archivo: { nombre, mime, tipo: expect.any(String) },
    });
  });

  it.each([
    ['un .exe renombrado a .pdf', 'programa.exe', 'factura.pdf', 'CONTENIDO_NO_COINCIDE'],
    ['un .png con contenido JPG', 'foto.jpg', 'foto.png', 'CONTENIDO_NO_COINCIDE'],
    ['un ZIP que no es Word con extensión .docx', 'comprimido-no-docx.zip', 'informe.docx', 'CONTENIDO_NO_COINCIDE'],
    ['un .gif', 'animacion.gif', 'animacion.gif', 'TIPO_NO_PERMITIDO'],
    ['un archivo sin extensión', 'documento.pdf', 'documento', 'TIPO_NO_PERMITIDO'],
  ])('%s → %s', async (_caso, archivo, nombre, problema) => {
    expect(await problemaDeArchivo(nombre, fixture(archivo), inspector)).toEqual({ problema });
  });

  it('0 bytes → VACIO', async () => {
    expect(await problemaDeArchivo('vacio.pdf', new Uint8Array(0), inspector)).toEqual({ problema: 'VACIO' });
  });

  it('más de 10 MB → MUY_GRANDE; exactamente 10 MB pasa', async () => {
    const grande = new Uint8Array(TAMANO_MAXIMO + 1);
    grande.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(await problemaDeArchivo('grande.pdf', grande, inspector)).toEqual({ problema: 'MUY_GRANDE' });
    expect(await problemaDeArchivo('justo.pdf', grande.subarray(0, TAMANO_MAXIMO), inspector)).toMatchObject({
      archivo: { mime: 'application/pdf' },
    });
  });

  it('un nombre que queda vacío → NOMBRE_INVALIDO', async () => {
    expect(await problemaDeArchivo('carpeta/', fixture('documento.pdf'), inspector)).toEqual({ problema: 'NOMBRE_INVALIDO' });
  });
});

describe('limpiarNombre', () => {
  it.each([
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['C:\\Users\\ana\\foto.jpg', 'foto.jpg'],
    ['  informe\u0000\u0007 final.pdf ', 'informe final.pdf'],
  ])('%p → %p', (nombre, esperado) => {
    expect(limpiarNombre(nombre)).toBe(esperado);
  });

  it('corta a 255 caracteres conservando el final (la extensión)', () => {
    const limpio = limpiarNombre(`${'a'.repeat(300)}.pdf`);
    expect([...limpio]).toHaveLength(255);
    expect(limpio.endsWith('.pdf')).toBe(true);
  });
});

describe('validarArchivos', () => {
  it('si un archivo falla, lanza ADJUNTO_INVALIDO con un detalle por cada archivo inválido', async () => {
    let error: unknown;
    try {
      await validarArchivos(
        [
          { nombre: 'bien.pdf', contenido: fixture('documento.pdf') },
          { nombre: 'falso.pdf', contenido: fixture('programa.exe') },
          { nombre: 'animacion.gif', contenido: fixture('animacion.gif') },
        ],
        inspector,
      );
    } catch (capturado) {
      error = capturado;
    }
    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect(error).toMatchObject({
      codigo: 'ADJUNTO_INVALIDO',
      detalles: [
        { campo: 'falso.pdf', problema: 'CONTENIDO_NO_COINCIDE' },
        { campo: 'animacion.gif', problema: 'TIPO_NO_PERMITIDO' },
      ],
    });
  });

  it('con todos válidos devuelve sus nombres limpios y MIME', async () => {
    expect(
      await validarArchivos(
        [
          { nombre: '../x/foto.jpg', contenido: fixture('foto.jpg') },
          { nombre: 'informe.docx', contenido: fixture('informe.docx') },
        ],
        inspector,
      ),
    ).toEqual([
      { nombre: 'foto.jpg', mime: 'image/jpeg', tipo: 'jpg' },
      {
        nombre: 'informe.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        tipo: 'docx',
      },
    ]);
  });
});
