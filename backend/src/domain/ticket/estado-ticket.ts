// Mismos valores y orden que el enum estado_ticket de SPEC 03.
export const ESTADOS_TICKET = [
  'nueva',
  'en_revision',
  'rechazada',
  'asignada',
  'en_proceso',
  'en_espera',
  'resuelta',
  'cerrada',
] as const;

export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const ESTADOS_FINALES: readonly EstadoTicket[] = ['rechazada', 'cerrada'];

export function esFinal(estado: EstadoTicket): boolean {
  return ESTADOS_FINALES.includes(estado);
}
