// Fechas locales YYYY-MM-DD (America/Guatemala) de los rangos de consulta: la bitácora (SPEC 41) y el tablero
// (SPEC 43).
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD de un día que existe (2026-02-30 no).
export function esFechaValida(fecha: string): boolean {
  const instante = Date.parse(`${fecha}T00:00:00Z`);
  return FECHA.test(fecha) && !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === fecha;
}

// Días entre dos fechas YYYY-MM-DD, contando las dos (2026-11-01 a 2026-11-01 es 1).
export function diasIncluidos(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;
}

// Una fecha YYYY-MM-DD desplazada `dias` días.
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}
