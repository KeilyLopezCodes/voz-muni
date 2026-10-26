import type { EstadoAvisoComentarios } from '../notificaciones/aviso-comentarios';

// Queja con comentarios públicos sin avisar y la ventana del último aviso ya cerrada (SPEC 35).
export interface QuejaConAvisoPendiente {
  ticketId: number;
  numero: string;
  titulo: string;
  solicitante: { id: number; nombre: string; email: string | null };
  pendientes: number;
}

// Estado de los avisos de comentarios (tickets.aviso_comentario_en y avisos_comentario_pendientes, SPEC 35). Se usa
// dentro de una Transaccion.
export interface AvisosComentariosRepository {
  // El ticket ya está bloqueado por quien llama (FOR UPDATE de ticketsEscritura.obtenerParaActualizar).
  obtenerEstado(ticketId: number): Promise<EstadoAvisoComentarios>;
  guardarEstado(ticketId: number, estado: EstadoAvisoComentarios): Promise<void>;
  // FOR UPDATE SKIP LOCKED: las quejas con pendientes cuyo último aviso fue en `cerradaHasta` o antes. Dos corridas
  // del job, o una corrida y un comentario, nunca toman la misma queja.
  reclamarVencidos(cerradaHasta: Date, limite: number): Promise<QuejaConAvisoPendiente[]>;
}
