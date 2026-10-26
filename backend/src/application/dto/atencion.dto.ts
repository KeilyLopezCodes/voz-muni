import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { TicketAtencion } from '../../domain/repositories/atencion-lectura-repository';
import type { SlaDto } from './sla.dto';

// Acciones de atención de POST /api/v1/tickets/:id/transiciones (SPEC 22).
export type ComandoAtencion =
  | { accion: 'iniciar' }
  | { accion: 'poner_en_espera'; motivo: string }
  | { accion: 'reanudar' }
  | { accion: 'resolver'; descripcion: string };

export interface AtencionHechaDto {
  id: number;
  numero: string;
  estado: EstadoTicket;
  asignadoA: number | null;
  resueltoEn: string | null; // ISO 8601 en UTC
}

export interface TicketAtencionDto extends Omit<TicketAtencion, 'creadoEn' | 'sla'> {
  creadoEn: string; // ISO 8601 en UTC
  sla: SlaDto; // vencimientos para los internos (SPEC 30)
}
