import type { ComentarioLeido } from '../../domain/repositories/comentario-repository';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';

// Cuerpo de POST /api/v1/tickets/:id/comentarios (SPEC 23).
export interface DatosComentario {
  cuerpo: string;
  interno: boolean;
}

export interface ComentarioDto extends Omit<ComentarioLeido, 'creadoEn' | 'editadoEn'> {
  creadoEn: string; // ISO 8601 en UTC
  editadoEn: string | null;
  editable: boolean; // el usuario es el autor y no pasaron 5 minutos
}

// `ticket.estado` es el estado después de comentar: en_proceso si el comentario del vecino reanudó la queja.
export interface ComentarioCreadoDto {
  comentario: ComentarioDto;
  ticket: { id: number; estado: EstadoTicket };
}
