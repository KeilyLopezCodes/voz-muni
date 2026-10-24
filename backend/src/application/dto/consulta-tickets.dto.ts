import type { TicketDetalleLectura, TicketListado } from '../../domain/repositories/ticket-lectura-repository';
import type { SlaLectura } from '../../domain/sla/sla-lectura';

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

// Plazo y acciones de confirmación en el detalle (SPEC 27). Los permisos los calcula el backend con el alcance de
// tickets.cambiar_estado del usuario; la interfaz solo muestra los botones.
export interface ConfirmacionDetalleDto {
  venceEn: string; // ISO 8601 en UTC
  vencida: boolean; // ahora > venceEn
  reaperturasRestantes: number; // max(0, max_reaperturas - reaperturas)
  puedeConfirmar: boolean;
  puedeReabrir: boolean;
  exigeMotivoAlConfirmar: boolean;
}

// GET /api/v1/tickets/:id (SPEC 25). RF-25 agrega campos sin quitar ni renombrar estos.
export interface TicketDetalleDto
  extends Omit<
    TicketDetalleLectura,
    'creadoEn' | 'resueltoEn' | 'cerradoEn' | 'resolucion' | 'confirmacionVenceEn' | 'reaperturas' | 'solicitanteId' | 'sla'
  > {
  creadoEn: string; // ISO 8601 en UTC
  resueltoEn: string | null;
  cerradoEn: string | null;
  esSolicitante: boolean; // el usuario autenticado es el solicitante
  resolucion: ResolucionDetalleDto | null;
  confirmacion: ConfirmacionDetalleDto | null; // solo si estado === 'resuelta' y hay vencimiento (SPEC 27)
  sla: SlaLectura | null; // null con el alcance propia de tickets.ver (SPEC 30)
}
