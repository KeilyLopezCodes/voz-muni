import type { SlaLectura } from '../../domain/sla/vencimientos';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';

// Vencimientos para los internos (SPEC 30). "Vencido" lo calcula el frontend con la hora actual, para que el dato
// no quede viejo en la caché.
export interface SlaDto {
  venceRespuesta: string | null; // ISO 8601 en UTC
  primeraRespuestaEn: string | null;
  venceResolucion: string | null; // null mientras está en pausa
  pausado: boolean; // estado === 'en_espera'
  restanteMinutosEnPausa: number | null; // minutos hábiles que faltaban al entrar en espera
}

const iso = (fecha: Date | null) => (fecha === null ? null : fecha.toISOString());

export function aSlaDto(sla: SlaLectura, estado: EstadoTicket): SlaDto {
  return {
    venceRespuesta: iso(sla.venceRespuesta),
    primeraRespuestaEn: iso(sla.primeraRespuestaEn),
    venceResolucion: iso(sla.venceResolucion),
    pausado: estado === 'en_espera',
    restanteMinutosEnPausa: sla.restanteMinutosEnPausa,
  };
}
