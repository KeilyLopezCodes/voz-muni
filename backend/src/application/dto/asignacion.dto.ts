import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { TicketPorAsignar } from '../../domain/repositories/por-asignar-lectura-repository';
import type { SlaDto } from './sla.dto';

// Cuerpo de PATCH /api/v1/tickets/:id/asignacion (SPEC 20).
export interface DatosAsignacion {
  tecnicoId: number;
  motivo?: string;
}

export interface AsignacionHechaDto {
  id: number;
  numero: string;
  estado: EstadoTicket; // no cambia al asignar
  asignadoA: number;
  tecnicoAnterior: number | null;
}

export interface TicketPorAsignarDto extends Omit<TicketPorAsignar, 'creadoEn' | 'sla'> {
  creadoEn: string; // ISO 8601 en UTC
  sla: SlaDto; // vencimientos para los internos (SPEC 30)
}
