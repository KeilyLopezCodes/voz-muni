import type { Alcance } from '../auth/permisos';

// Atención interna de la queja (RF-18, RF-21, RF-23, SPEC 22). Los métodos de dominio son los de SPEC 04.
export const ACCIONES_ATENCION = ['iniciar', 'poner_en_espera', 'reanudar', 'resolver'] as const;

export type AccionAtencion = (typeof ACCIONES_ATENCION)[number];

// Alcances de tickets.cambiar_estado que habilitan las acciones de atención. La regla no nombra roles:
// cada rol tiene su alcance en roles.permisos (SPEC 08). `propia` (vecino) queda fuera: sus acciones llegan con RF-24.
export const ALCANCES_ATENCION: readonly Alcance[] = ['asignadas', 'dependencia', 'todas'];

export function puedeAtender(alcance: Alcance | undefined): boolean {
  return alcance !== undefined && ALCANCES_ATENCION.includes(alcance);
}

export function esAccionAtencion(accion: string): accion is AccionAtencion {
  return (ACCIONES_ATENCION as readonly string[]).includes(accion);
}
