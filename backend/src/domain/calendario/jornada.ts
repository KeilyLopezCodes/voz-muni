import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Jornada laboral municipal (SPEC 30): la misma para todos los días con es_habil = true de calendario_laboral.
// Vive en parametros.jornada_laboral; nunca se escribe en el código.

export const CLAVE_JORNADA_LABORAL = 'jornada_laboral';

export interface JornadaLaboral {
  inicio: string; // 'HH:MM', 24 h, en ZONA_MUNICIPAL
  fin: string; // 'HH:MM', estrictamente mayor que inicio
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Minutos desde la medianoche de una hora 'HH:MM' ya validada.
export function minutoDelDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Lanza ReglaDeNegocioError PARAMETRO_INVALIDO si el formato o el orden no son válidos.
export function validarJornada(valor: unknown): JornadaLaboral {
  const { inicio, fin } = (typeof valor === 'object' && valor !== null ? valor : {}) as Record<string, unknown>;
  if (typeof inicio !== 'string' || typeof fin !== 'string' || !HORA.test(inicio) || !HORA.test(fin)) {
    throw new ReglaDeNegocioError('PARAMETRO_INVALIDO', `${CLAVE_JORNADA_LABORAL} debe ser { inicio: 'HH:MM', fin: 'HH:MM' }`);
  }
  if (minutoDelDia(fin) <= minutoDelDia(inicio)) {
    throw new ReglaDeNegocioError('PARAMETRO_INVALIDO', `En ${CLAVE_JORNADA_LABORAL}, fin debe ser mayor que inicio`);
  }
  return { inicio, fin };
}

export function minutosPorJornada(jornada: JornadaLaboral): number {
  return minutoDelDia(jornada.fin) - minutoDelDia(jornada.inicio);
}
