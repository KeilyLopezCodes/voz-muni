import type { FiltroTickets } from '../autorizacion/alcance-tickets';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Reportes filtrados por el alcance de reportes.ver (SPEC 11). Los indicadores de SLA llegan con RF-39.
export interface ReporteLecturaRepository {
  // Los 8 estados, con 0 si no hay tickets en ese estado.
  contarPorEstado(filtro: FiltroTickets): Promise<Record<EstadoTicket, number>>;
}
