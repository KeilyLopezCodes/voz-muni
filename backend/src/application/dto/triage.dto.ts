import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { Prioridad } from '../../domain/ticket/prioridad';
import type { TicketTriage } from '../../domain/repositories/triage-lectura-repository';

// Cuerpo de POST /api/v1/tickets/:id/transiciones (SPEC 19). Las specs de RF-18 agregarán más acciones.
export type ComandoTriage =
  | { accion: 'tomar' }
  | { accion: 'aceptar'; prioridad: Prioridad; categoriaId?: number }
  | { accion: 'rechazar'; motivo: string };

export interface TransicionDto {
  id: number;
  numero: string;
  estado: EstadoTicket;
  prioridad: Prioridad | null;
  categoriaId: number;
  dependenciaId: number | null;
  venceRespuesta: string | null; // ISO 8601 en UTC; lo calcula aceptar (SPEC 30)
  venceResolucion: string | null;
}

export interface TicketTriageDto extends Omit<TicketTriage, 'creadoEn'> {
  creadoEn: string; // ISO 8601 en UTC
}
