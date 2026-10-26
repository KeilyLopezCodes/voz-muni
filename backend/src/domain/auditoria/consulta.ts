import { diasIncluidos, esFechaValida } from '../calendario/fechas';
import { instanteLocal } from '../calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// La consulta de la bitácora (SPEC 41): un rango de fechas locales de Guatemala, de 92 días como máximo, para que
// la consulta siempre use los índices por fecha.
export const RANGO_MAXIMO_DIAS = 92;
export const DIAS_POR_DEFECTO = 7;

export { sumarDias } from '../calendario/fechas';

// [desde 00:00, día siguiente a hasta 00:00) en America/Guatemala. `hasta` incluye el día completo.
export function rangoBitacora(desde: string, hasta: string): { desde: Date; hasta: Date } {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    throw new ReglaDeNegocioError('VALIDACION', 'Las fechas deben tener la forma YYYY-MM-DD');
  }
  const dias = diasIncluidos(desde, hasta);
  if (dias < 1) {
    throw new ReglaDeNegocioError('VALIDACION', 'La fecha final no puede ser anterior a la inicial');
  }
  if (dias > RANGO_MAXIMO_DIAS) {
    throw new ReglaDeNegocioError('VALIDACION', `El rango admite hasta ${RANGO_MAXIMO_DIAS} días`);
  }
  return { desde: instanteLocal(desde, 0), hasta: instanteLocal(hasta, 24 * 60) };
}
