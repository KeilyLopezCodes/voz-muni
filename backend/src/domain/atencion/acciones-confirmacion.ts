import type { Alcance } from '../auth/permisos';

// Confirmar o reabrir una solución (RF-24, SPEC 27). La regla no nombra roles: cada rol tiene su alcance de
// tickets.cambiar_estado en roles.permisos (SPEC 08).

export const ACCIONES_CONFIRMACION = ['confirmar', 'reabrir'] as const;

export type AccionConfirmacion = (typeof ACCIONES_CONFIRMACION)[number];

export function esAccionConfirmacion(accion: string): accion is AccionConfirmacion {
  return (ACCIONES_CONFIRMACION as readonly string[]).includes(accion);
}

// Alcances de tickets.cambiar_estado que habilitan confirmar y reabrir (matriz, sección 2). `asignadas` (técnico)
// queda fuera: la matriz solo le da en proceso, en espera y resuelta.
export const ALCANCES_CONFIRMACION: readonly Alcance[] = ['propia', 'dependencia', 'todas'];

export function puedeConfirmar(alcance: Alcance | undefined): boolean {
  return alcance !== undefined && ALCANCES_CONFIRMACION.includes(alcance);
}

// Confirmar exige motivo para todo alcance distinto de 'propia': el historial explica por qué cerró alguien que
// no es el solicitante.
export function exigeMotivoAlConfirmar(alcance: Alcance): boolean {
  return alcance !== 'propia';
}
