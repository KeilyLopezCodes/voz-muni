import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import { type JornadaLaboral, minutoDelDia } from './jornada';
import { fechaLocal, instanteLocal } from './plazo-confirmacion';

// Aritmética de tiempo hábil (RF-27, SPEC 30): la jornada de cada día hábil, en la zona municipal. Funciones puras:
// los días los lee la aplicación con CalendarioRepository. El tiempo hábil de un día es [inicio, fin).

// Fechas hábiles (YYYY-MM-DD) que cubren el rango pedido, en orden.
export type DiasHabiles = readonly string[];

const MS_POR_MINUTO = 60_000;

function jornadaDe(fecha: string, jornada: JornadaLaboral): { inicio: number; fin: number } {
  return {
    inicio: instanteLocal(fecha, minutoDelDia(jornada.inicio)).getTime(),
    fin: instanteLocal(fecha, minutoDelDia(jornada.fin)).getTime(),
  };
}

// El instante que resulta de sumar `minutos` hábiles a `desde`. Antes del inicio de la jornada se empieza en el
// inicio; después del fin o en un día no hábil, en el inicio del siguiente día hábil. Si la suma termina justo al
// fin de una jornada, el resultado es ese fin. Con 0 minutos devuelve el primer instante hábil desde `desde`.
// Lanza CALENDARIO_INCOMPLETO si los días recibidos no alcanzan: nunca se inventa un plazo.
export function sumarMinutosHabiles(desde: Date, minutos: number, dias: DiasHabiles, jornada: JornadaLaboral): Date {
  if (!Number.isInteger(minutos) || minutos < 0) {
    throw new RangeError(`Los minutos hábiles deben ser un entero ≥ 0 (recibido ${minutos})`);
  }
  const fechaDesde = fechaLocal(desde);
  let restante = minutos * MS_POR_MINUTO;
  for (const fecha of dias) {
    if (fecha < fechaDesde) {
      continue;
    }
    const { inicio, fin } = jornadaDe(fecha, jornada);
    const empieza = Math.max(inicio, desde.getTime());
    if (empieza >= fin) {
      continue;
    }
    if (restante <= fin - empieza) {
      return new Date(empieza + restante);
    }
    restante -= fin - empieza;
  }
  throw new ReglaDeNegocioError('CALENDARIO_INCOMPLETO', `El calendario laboral no alcanza para sumar ${minutos} minutos hábiles`);
}

// Minutos hábiles enteros (redondeados hacia abajo) en el intervalo [desde, hasta). Es 0 si hasta <= desde.
// `dias` debe traer todas las fechas hábiles entre las fechas locales de los dos instantes.
export function minutosHabilesEntre(desde: Date, hasta: Date, dias: DiasHabiles, jornada: JornadaLaboral): number {
  if (hasta.getTime() <= desde.getTime()) {
    return 0;
  }
  const fechaDesde = fechaLocal(desde);
  const fechaHasta = fechaLocal(hasta);
  let total = 0;
  for (const fecha of dias) {
    if (fecha < fechaDesde || fecha > fechaHasta) {
      continue;
    }
    const { inicio, fin } = jornadaDe(fecha, jornada);
    const empieza = Math.max(inicio, desde.getTime());
    const termina = Math.min(fin, hasta.getTime());
    if (termina > empieza) {
      total += termina - empieza;
    }
  }
  return Math.floor(total / MS_POR_MINUTO);
}
