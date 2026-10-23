import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';

// Número público de la queja: Q-AAAA-NNNNNN (RF-08).
export const MAX_CORRELATIVO = 999_999;

const ZONA_MUNICIPAL = 'America/Guatemala';

// formatearNumero(2026, 123) === 'Q-2026-000123'.
export function formatearNumero(anio: number, correlativo: number): string {
  if (correlativo > MAX_CORRELATIVO) {
    throw new ReglaDeNegocioError(
      'CORRELATIVO_AGOTADO',
      `Se agotaron los ${MAX_CORRELATIVO} números del año ${anio}`,
    );
  }
  return `Q-${anio}-${String(correlativo).padStart(6, '0')}`;
}

// Año calendario de `instante` en Guatemala, que es el que ve el vecino (RNF-23). Sin dependencias npm.
export function anioGuatemala(instante: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONA_MUNICIPAL, year: 'numeric' }).format(instante));
}
