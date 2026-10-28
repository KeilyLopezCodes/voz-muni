import { esFechaValida } from '../calendario/fechas';
import { instanteLocal } from '../calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Rango de registro del listado de gestión (SPEC 45): días completos de creado_en en America/Guatemala. Las dos
// fechas son opcionales e independientes y, a diferencia del tablero (SPEC 43), no hay rango máximo ni por defecto.
export interface RangoCreacion {
  inicio: Date | null; // desde 00:00 en Guatemala (incluido)
  fin: Date | null; // el día siguiente a hasta, 00:00 en Guatemala (excluido)
}

export function rangoCreacion(desde?: string, hasta?: string): RangoCreacion {
  if ((desde !== undefined && !esFechaValida(desde)) || (hasta !== undefined && !esFechaValida(hasta))) {
    throw new ReglaDeNegocioError('RANGO_INVALIDO', 'Las fechas deben tener la forma YYYY-MM-DD');
  }
  if (desde !== undefined && hasta !== undefined && hasta < desde) {
    throw new ReglaDeNegocioError('RANGO_INVALIDO', 'La fecha final no puede ser anterior a la inicial');
  }
  return {
    inicio: desde === undefined ? null : instanteLocal(desde, 0),
    fin: hasta === undefined ? null : instanteLocal(hasta, 24 * 60),
  };
}
