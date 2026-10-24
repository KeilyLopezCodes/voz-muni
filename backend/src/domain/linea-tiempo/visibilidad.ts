import type { Alcance } from '../auth/permisos';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Transiciones cuyo motivo está dirigido al vecino (SPEC 28): rechazo, información solicitada, solución y
// reapertura. Lista explícita: una transición nueva queda oculta para el vecino hasta que se agregue aquí.
const MOTIVOS_PUBLICOS: readonly { anterior: EstadoTicket | '*'; nuevo: EstadoTicket }[] = [
  { anterior: '*', nuevo: 'rechazada' },
  { anterior: 'en_proceso', nuevo: 'en_espera' },
  { anterior: 'en_proceso', nuevo: 'resuelta' },
  { anterior: 'resuelta', nuevo: 'en_proceso' },
];

// true si el motivo de la transición está dirigido al vecino.
export function motivoEsPublico(anterior: EstadoTicket | null, nuevo: EstadoTicket): boolean {
  if (anterior === null) {
    return false;
  }
  return MOTIVOS_PUBLICOS.some((regla) => regla.nuevo === nuevo && (regla.anterior === '*' || regla.anterior === anterior));
}

// La vista pública corresponde al alcance `propia` de tickets.ver (el solicitante), nunca al nombre del rol.
export function esVistaPublica(alcanceVer: Alcance | undefined): boolean {
  return alcanceVer === 'propia';
}
