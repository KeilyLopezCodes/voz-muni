import type { Alcance } from '../auth/permisos';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Qué ve el vecino en la línea de tiempo (RF-25, SPEC 28). Las reglas no nombran roles: dependen del alcance de
// tickets.ver (SPEC 08) y de los estados (SPEC 04).

// Transiciones cuyo motivo está dirigido al vecino. Es una lista de lo permitido: una transición nueva queda
// oculta en la vista pública hasta que se agregue aquí.
const MOTIVOS_PUBLICOS: readonly { anterior: EstadoTicket | '*'; nuevo: EstadoTicket }[] = [
  { anterior: '*', nuevo: 'rechazada' }, // motivo del rechazo (SPEC 19)
  { anterior: 'en_proceso', nuevo: 'en_espera' }, // información solicitada (SPEC 22)
  { anterior: 'en_proceso', nuevo: 'resuelta' }, // descripción de la solución (SPEC 22)
  { anterior: 'resuelta', nuevo: 'en_proceso' }, // motivo de la reapertura (SPEC 27)
];

// true si el motivo de la transición está dirigido al vecino.
export function motivoEsPublico(anterior: EstadoTicket | null, nuevo: EstadoTicket): boolean {
  return MOTIVOS_PUBLICOS.some(
    (m) => m.nuevo === nuevo && (m.anterior === '*' ? anterior !== null : m.anterior === anterior),
  );
}

// La vista pública corresponde al alcance 'propia' de tickets.ver.
export function esVistaPublica(alcanceVer: Alcance): boolean {
  return alcanceVer === 'propia';
}
