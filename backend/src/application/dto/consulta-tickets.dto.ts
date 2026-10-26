import type { TicketDetalleLectura, TicketListado } from '../../domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { SlaDto } from './sla.dto';

// Resolución vigente en el detalle (SPEC 26). resueltaPor es null para el alcance propia de tickets.ver (el vecino).
export interface ResolucionDetalleDto {
  descripcion: string;
  resueltaEn: string; // ISO 8601 en UTC (tickets.resuelto_en)
  resueltaPor: { id: number; nombre: string } | null;
}

// Fila de GET /api/v1/tickets (SPEC 25).
export interface TicketListadoDto
  extends Omit<TicketListado, 'creadoEn' | 'confirmacionVenceEn' | 'cerradoEn' | 'tieneEncuesta' | 'solicitanteId'> {
  creadoEn: string; // ISO 8601 en UTC
  confirmacionVenceEn: string | null; // ISO 8601 en UTC, solo en resuelta (SPEC 38)
  pendienteCalificar: boolean; // el usuario es el solicitante y puede calificarla (SPEC 39)
}

// La encuesta de la queja (SPEC 39).
export interface EncuestaDetalleDto {
  calificacion: number;
  comentario: string | null;
  creadoEn: string; // ISO 8601 en UTC
}

// Filtros de GET /api/v1/tickets (SPEC 38), ya validados: estados sin repetir y `q` recortado de 2 a 100 caracteres.
export interface FiltrosListadoDto {
  estados: readonly EstadoTicket[];
  q?: string;
}

// GET /api/v1/tickets/resumen (SPEC 38).
export interface ResumenTicketsDto {
  porEstado: Record<EstadoTicket, number>;
  total: number;
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
    | 'creadoEn'
    | 'resueltoEn'
    | 'cerradoEn'
    | 'resolucion'
    | 'confirmacionVenceEn'
    | 'reaperturas'
    | 'solicitanteId'
    | 'sla'
    | 'encuesta'
  > {
  creadoEn: string; // ISO 8601 en UTC
  resueltoEn: string | null;
  cerradoEn: string | null;
  esSolicitante: boolean; // el usuario autenticado es el solicitante
  resolucion: ResolucionDetalleDto | null;
  confirmacion: ConfirmacionDetalleDto | null; // solo si estado === 'resuelta' y hay vencimiento (SPEC 27)
  sla: SlaDto | null; // null con el alcance propia de tickets.ver: el vecino no ve los vencimientos (SPEC 30)
  encuesta: EncuestaDetalleDto | null; // la ven el solicitante y los internos con alcance (SPEC 39)
  puedeCalificar: boolean; // solicitante, cerrada, sin encuesta y dentro del plazo
  encuestaVenceEn: string | null; // solo si puedeCalificar
}
