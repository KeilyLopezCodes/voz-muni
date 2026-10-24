import { type DetalleProblema, ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import type { InspectorDocx } from './inspector-docx';

// Tipos y tamaño de los adjuntos (RNF-11, SPEC 24). El tipo se decide por los primeros bytes cruzados con la
// extensión del nombre; el MIME que manda el navegador se ignora.

export const TAMANO_MAXIMO = 10 * 1024 * 1024;
export const NOMBRE_MAX = 255;
export const TIPOS_PERMITIDOS = ['pdf', 'jpg', 'png', 'docx'] as const;

export type TipoArchivo = (typeof TIPOS_PERMITIDOS)[number];

export type MotivoAdjuntoInvalido =
  | 'TIPO_NO_PERMITIDO'
  | 'CONTENIDO_NO_COINCIDE'
  | 'MUY_GRANDE'
  | 'VACIO'
  | 'NOMBRE_INVALIDO';

const EXTENSIONES: Readonly<Record<string, TipoArchivo>> = {
  pdf: 'pdf',
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  docx: 'docx',
};

const FIRMAS: Readonly<Record<TipoArchivo, readonly number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP; que sea Word lo confirma el InspectorDocx
};

export const MIME_POR_TIPO: Readonly<Record<TipoArchivo, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface ArchivoValidado {
  nombre: string; // limpio, para mostrar y para Content-Disposition
  mime: string;
  tipo: TipoArchivo;
}

// Solo el último segmento del nombre, sin caracteres de control y con 255 caracteres como máximo.
export function limpiarNombre(nombre: string): string {
  const segmento = (typeof nombre === 'string' ? nombre : '').split(/[/\\]/).pop() ?? '';
  const limpio = segmento.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return [...limpio].slice(-NOMBRE_MAX).join('');
}

function tieneFirma(contenido: Uint8Array, firma: readonly number[]): boolean {
  return contenido.length >= firma.length && firma.every((byte, i) => contenido[i] === byte);
}

// Devuelve el problema del archivo, o null si es válido. No lanza: el servicio junta los problemas de todos los
// archivos de la petición en un solo ADJUNTO_INVALIDO.
export async function problemaDeArchivo(
  nombre: string,
  contenido: Uint8Array,
  inspector: InspectorDocx,
): Promise<{ problema: MotivoAdjuntoInvalido } | { archivo: ArchivoValidado }> {
  const limpio = limpiarNombre(nombre);
  if (limpio === '') return { problema: 'NOMBRE_INVALIDO' };
  if (contenido.length === 0) return { problema: 'VACIO' };
  if (contenido.length > TAMANO_MAXIMO) return { problema: 'MUY_GRANDE' };
  const extension = limpio.includes('.') ? limpio.split('.').pop()!.toLowerCase() : '';
  const tipo = EXTENSIONES[extension];
  if (!tipo) return { problema: 'TIPO_NO_PERMITIDO' };
  if (!tieneFirma(contenido, FIRMAS[tipo])) return { problema: 'CONTENIDO_NO_COINCIDE' };
  if (tipo === 'docx' && !(await inspector.esDocx(contenido))) return { problema: 'CONTENIDO_NO_COINCIDE' };
  return { archivo: { nombre: limpio, mime: MIME_POR_TIPO[tipo], tipo } };
}

// Valida todos los archivos de una petición: si alguno falla, lanza ADJUNTO_INVALIDO con un detalle por archivo
// inválido (campo = nombre limpio, o el original si no queda nada). Todo o nada.
export async function validarArchivos(
  archivos: readonly { nombre: string; contenido: Uint8Array }[],
  inspector: InspectorDocx,
): Promise<ArchivoValidado[]> {
  const validos: ArchivoValidado[] = [];
  const detalles: DetalleProblema[] = [];
  for (const { nombre, contenido } of archivos) {
    const resultado = await problemaDeArchivo(nombre, contenido, inspector);
    if ('problema' in resultado) {
      detalles.push({ campo: limpiarNombre(nombre) || nombre, problema: resultado.problema });
    } else {
      validos.push(resultado.archivo);
    }
  }
  if (detalles.length > 0) {
    throw new ReglaDeNegocioError('ADJUNTO_INVALIDO', 'Algún archivo no es válido', detalles);
  }
  return validos;
}
