import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { type JornadaLaboral, minutosDelDia } from './jornada';
import { instanteLocal } from './plazo-confirmacion';

// Aritmética de tiempo hábil (RF-27, SPEC 30). Funciones puras: los días hábiles (YYYY-MM-DD, en orden) los lee la
// aplicación de calendario_laboral. La hora local sale de Intl, sin desfase fijo.
export type DiasHabiles = readonly string[];

const MS_MINUTO = 60_000;

function tramo(dia: string, jornada: JornadaLaboral): { inicio: number; fin: number } {
  const inicio = minutosDelDia(jornada.inicio);
  const fin = minutosDelDia(jornada.fin);
  return {
    inicio: instanteLocal(dia, Math.floor(inicio / 60), inicio % 60).getTime(),
    fin: instanteLocal(dia, Math.floor(fin / 60), fin % 60).getTime(),
  };
}

// El instante que resulta de sumar `minutos` hábiles a `desde`. Antes de la jornada empieza al inicio; después del
// fin o en un día no hábil, al inicio del siguiente día hábil. Terminar justo al fin devuelve ese fin.
// Lanza CALENDARIO_INCOMPLETO si los días recibidos no alcanzan: nunca se inventa un plazo.
export function sumarMinutosHabiles(desde: Date, minutos: number, dias: DiasHabiles, jornada: JornadaLaboral): Date {
  let restanteMs = Math.max(0, minutos) * MS_MINUTO;
  for (const dia of dias) {
    const { inicio, fin } = tramo(dia, jornada);
    if (fin <= desde.getTime()) {
      continue;
    }
    const arranque = Math.max(inicio, desde.getTime());
    const disponible = fin - arranque;
    if (restanteMs <= disponible) {
      return new Date(arranque + restanteMs);
    }
    restanteMs -= disponible;
  }
  throw new ReglaDeNegocioError('CALENDARIO_INCOMPLETO', 'El calendario laboral no cubre el plazo a calcular');
}

// Minutos hábiles enteros en [desde, hasta). 0 si hasta <= desde.
export function minutosHabilesEntre(desde: Date, hasta: Date, dias: DiasHabiles, jornada: JornadaLaboral): number {
  if (hasta.getTime() <= desde.getTime()) {
    return 0;
  }
  let totalMs = 0;
  for (const dia of dias) {
    const { inicio, fin } = tramo(dia, jornada);
    const solape = Math.min(fin, hasta.getTime()) - Math.max(inicio, desde.getTime());
    if (solape > 0) {
      totalMs += solape;
    }
  }
  return Math.floor(totalMs / MS_MINUTO);
}
