import { instanteLocal } from '../calendario/plazo-confirmacion';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// La consulta de la bitácora (SPEC 41): un rango de fechas locales de Guatemala, de 92 días como máximo, para que
// la consulta siempre use los índices por fecha.
export const RANGO_MAXIMO_DIAS = 92;
export const DIAS_POR_DEFECTO = 7;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD de un día que existe (2026-02-30 no).
function esFechaValida(fecha: string): boolean {
  const instante = Date.parse(`${fecha}T00:00:00Z`);
  return FECHA.test(fecha) && !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === fecha;
}

// Días entre dos fechas YYYY-MM-DD, contando las dos (2026-11-01 a 2026-11-01 es 1).
const diasIncluidos = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;

// Una fecha YYYY-MM-DD desplazada `dias` días.
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

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
