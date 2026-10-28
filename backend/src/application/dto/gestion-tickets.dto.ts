import type { OpcionesGestion, TicketGestion } from '../../domain/repositories/gestion-lectura-repository';
import type { SlaDto } from './sla.dto';

// Fila de GET /api/v1/tickets/gestion (SPEC 45). Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketGestionDto extends Omit<TicketGestion, 'creadoEn' | 'sla'> {
  creadoEn: string; // ISO 8601 en UTC
  sla: SlaDto; // aSlaDto (SPEC 30)
}

// GET /api/v1/tickets/gestion/opciones: lo que puede elegirse en los filtros dentro del alcance.
export type OpcionesGestionDto = OpcionesGestion;
