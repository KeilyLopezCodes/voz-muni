import { diasIncluidos, esFechaValida, sumarDias } from '../calendario/fechas';
import { instanteLocal } from '../calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// El rango del tablero (SPEC 43): días completos de registro en America/Guatemala, de 366 como máximo para que la
// consulta sea acotada (RNF-01, RNF-04). Por defecto, los últimos 30 días que terminan hoy.
export const DIAS_POR_DEFECTO = 30;
export const RANGO_MAXIMO_DIAS = 366;

export interface RangoReportes {
  desde: string; // YYYY-MM-DD
  hasta: string; // incluido
  inicio: Date; // desde 00:00 en Guatemala
  fin: Date; // el día siguiente a hasta, 00:00 en Guatemala (exclusivo)
}

// `hoy` es la fecha local de Guatemala del momento de la consulta.
export function rangoReportes(desde: string | undefined, hasta: string | undefined, hoy: string): RangoReportes {
  const final = hasta ?? hoy;
  const inicial = desde ?? sumarDias(final, -(DIAS_POR_DEFECTO - 1));
  if (!esFechaValida(inicial) || !esFechaValida(final)) {
    throw new ReglaDeNegocioError('RANGO_INVALIDO', 'Las fechas deben tener la forma YYYY-MM-DD');
  }
  const dias = diasIncluidos(inicial, final);
  if (dias < 1) {
    throw new ReglaDeNegocioError('RANGO_INVALIDO', 'La fecha final no puede ser anterior a la inicial');
  }
  if (dias > RANGO_MAXIMO_DIAS) {
    throw new ReglaDeNegocioError('RANGO_INVALIDO', `El rango admite hasta ${RANGO_MAXIMO_DIAS} días`);
  }
  return { desde: inicial, hasta: final, inicio: instanteLocal(inicial, 0), fin: instanteLocal(final, 24 * 60) };
}
