import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Jornada laboral única para todos los días hábiles de calendario_laboral (SPEC 30). Vive en
// parametros.jornada_laboral; nunca se escribe en el código.
export interface JornadaLaboral {
  inicio: string; // 'HH:MM', 24 h, en la zona municipal
  fin: string; // 'HH:MM', estrictamente mayor que inicio
}

export const CLAVE_JORNADA_LABORAL = 'jornada_laboral';

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Lanza PARAMETRO_INVALIDO si el formato o el orden no son válidos.
export function validarJornada(valor: unknown): JornadaLaboral {
  const jornada = valor as Partial<JornadaLaboral> | null;
  if (
    !jornada ||
    typeof jornada !== 'object' ||
    typeof jornada.inicio !== 'string' ||
    typeof jornada.fin !== 'string' ||
    !HORA.test(jornada.inicio) ||
    !HORA.test(jornada.fin) ||
    minutosDelDia(jornada.fin) <= minutosDelDia(jornada.inicio)
  ) {
    throw new ReglaDeNegocioError('PARAMETRO_INVALIDO', 'jornada_laboral debe ser { inicio: "HH:MM", fin: "HH:MM" }');
  }
  return { inicio: jornada.inicio, fin: jornada.fin };
}

export function minutosPorJornada(jornada: JornadaLaboral): number {
  return minutosDelDia(jornada.fin) - minutosDelDia(jornada.inicio);
}
