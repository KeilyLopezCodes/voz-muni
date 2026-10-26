import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Encuesta de satisfacción al cerrar (RF-37, SPEC 39): una por queja, definitiva, y solo dentro del plazo.

export const CALIFICACION_MIN = 1;
export const CALIFICACION_MAX = 5;
export const COMENTARIO_MAX = 1000;

export const CLAVE_PLAZO_ENCUESTA = 'encuesta_plazo_dias';
export const CLAVE_UMBRAL_ENCUESTA = 'encuesta_umbral_alerta';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface DatosEncuesta {
  calificacion: number;
  comentario: string | null;
}

// Un entero de 1 a 5, y el comentario recortado (uno vacío pasa a null), de hasta 1000 caracteres.
export function validarEncuesta(calificacion: unknown, comentario: unknown): DatosEncuesta {
  if (
    typeof calificacion !== 'number' ||
    !Number.isInteger(calificacion) ||
    calificacion < CALIFICACION_MIN ||
    calificacion > CALIFICACION_MAX
  ) {
    throw new ReglaDeNegocioError('ENCUESTA_INVALIDA', `La calificación debe ser un entero de ${CALIFICACION_MIN} a ${CALIFICACION_MAX}`);
  }
  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    throw new ReglaDeNegocioError('ENCUESTA_INVALIDA', 'El comentario debe ser texto');
  }
  const recortado = typeof comentario === 'string' ? comentario.trim() : '';
  if ([...recortado].length > COMENTARIO_MAX) {
    throw new ReglaDeNegocioError('ENCUESTA_INVALIDA', `El comentario admite hasta ${COMENTARIO_MAX} caracteres`);
  }
  return { calificacion, comentario: recortado === '' ? null : recortado };
}

// El último instante para calificar: `plazoDias` días naturales después del cierre (es un plazo del vecino, no de
// trabajo municipal). null si la queja no está cerrada.
export function venceEncuesta(cerradoEn: Date | null, plazoDias: number): Date | null {
  return cerradoEn === null ? null : new Date(cerradoEn.getTime() + plazoDias * DIA_MS);
}

// Solo una queja cerrada (confirmada o cerrada por el sistema), y hasta el instante exacto del vencimiento.
export function exigirCalificable(estado: EstadoTicket, cerradoEn: Date | null, ahora: Date, plazoDias: number): void {
  if (estado !== 'cerrada' || cerradoEn === null) {
    throw new ReglaDeNegocioError('ENCUESTA_NO_DISPONIBLE', 'Solo se califica una queja cerrada');
  }
  if (ahora.getTime() > venceEncuesta(cerradoEn, plazoDias)!.getTime()) {
    throw new ReglaDeNegocioError('ENCUESTA_VENCIDA', 'Pasó el plazo para calificar esta queja');
  }
}

// true si la queja todavía se puede calificar (cerrada, sin encuesta y dentro del plazo). No mira quién pregunta.
export function esCalificable(
  estado: EstadoTicket,
  cerradoEn: Date | null,
  tieneEncuesta: boolean,
  ahora: Date,
  plazoDias: number,
): boolean {
  if (tieneEncuesta) {
    return false;
  }
  try {
    exigirCalificable(estado, cerradoEn, ahora, plazoDias);
    return true;
  } catch {
    return false;
  }
}

// encuesta_plazo_dias: entero de 1 a 365. null si no lo es.
export function plazoEncuestaValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 365 ? valor : null;
}

// encuesta_umbral_alerta: entero de 0 a 5 (0 desactiva la alerta). null si no lo es.
export function umbralEncuestaValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= CALIFICACION_MAX ? valor : null;
}
