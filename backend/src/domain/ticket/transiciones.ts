import type { EstadoTicket } from './estado-ticket';

// Ciclo de vida de la sección 3 del documento de definición: 11 transiciones.
export const TRANSICIONES: Readonly<Record<EstadoTicket, readonly EstadoTicket[]>> = {
  nueva: ['en_revision'],
  en_revision: ['asignada', 'rechazada'],
  asignada: ['en_proceso', 'en_revision'],
  en_proceso: ['en_espera', 'resuelta', 'en_revision'],
  en_espera: ['en_proceso'],
  resuelta: ['cerrada', 'en_proceso'],
  rechazada: [],
  cerrada: [],
};

export function puedeTransicionar(desde: EstadoTicket, hacia: EstadoTicket): boolean {
  return TRANSICIONES[desde].includes(hacia);
}
