import type { TicketDetalleLectura, TicketListado } from '../../domain/repositories/ticket-lectura-repository';

// Resolución vigente en el detalle (SPEC 26). resueltaPor es null para el alcance propia de tickets.ver (el vecino).
export interface ResolucionDetalleDto {
  descripcion: string;
  resueltaEn: string; // ISO 8601 en UTC (tickets.resuelto_en)
  resueltaPor: { id: number; nombre: string } | null;
}

// Fila de GET /api/v1/tickets (SPEC 25).
export interface TicketListadoDto extends Omit<TicketListado, 'creadoEn'> {
  creadoEn: string; // ISO 8601 en UTC
}

// GET /api/v1/tickets/:id (SPEC 25). RF-25 agrega campos sin quitar ni renombrar estos.
export interface TicketDetalleDto
  extends Omit<TicketDetalleLectura, 'creadoEn' | 'resueltoEn' | 'cerradoEn' | 'resolucion' | 'solicitanteId'> {
  creadoEn: string; // ISO 8601 en UTC
  resueltoEn: string | null;
  cerradoEn: string | null;
  esSolicitante: boolean; // el usuario autenticado es el solicitante
  resolucion: ResolucionDetalleDto | null;
}
