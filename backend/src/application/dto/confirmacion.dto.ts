import type { EstadoTicket } from '../../domain/ticket/estado-ticket';

// Acciones de confirmación de POST /api/v1/tickets/:id/transiciones (SPEC 27).
export type ComandoConfirmacion = { accion: 'confirmar'; motivo?: string } | { accion: 'reabrir'; motivo: string };

export interface ConfirmacionHechaDto {
  id: number;
  numero: string;
  estado: EstadoTicket;
  asignadoA: number | null;
  resueltoEn: string | null; // ISO 8601 en UTC
  cerradoEn: string | null;
  reaperturas: number;
}
