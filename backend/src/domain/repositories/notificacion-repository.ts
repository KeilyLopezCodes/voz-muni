// Notificaciones en la aplicación para los internos (RF-28, RF-29, RF-32, SPEC 31, 32 y 36). El texto no se guarda:
// lo arma el frontend con el tipo y los datos.
export type TipoNotificacion =
  | 'sla_alerta_respuesta'
  | 'sla_alerta_resolucion'
  | 'sla_escalamiento'
  | 'asignacion_recibida'
  | 'asignacion_retirada'
  | 'comentario_nuevo'
  | 'respuesta_vecino'
  | 'queja_reabierta'
  | 'traslado_solicitado'
  | 'traslado_resuelto'
  | 'encuesta_baja';

export interface NuevaNotificacion {
  usuarioId: number;
  ticketId: number | null;
  tipo: TipoNotificacion;
  datos: Record<string, unknown>;
  creadoEn: Date;
}

export interface NotificacionLeida {
  id: number;
  tipo: string;
  leida: boolean;
  creadoEn: Date;
  ticket: { id: number; numero: string; titulo: string } | null;
  datos: Record<string, unknown>;
}

export interface NotificacionRepository {
  crear(filas: readonly NuevaNotificacion[]): Promise<void>;
  // comentario_nuevo se agrupa: una sola sin leer por usuario y queja (SPEC 36).
  agruparComentario(usuarioId: number, ticketId: number, interno: boolean, ahora: Date): Promise<void>;
  // Las más recientes del usuario y el total sin leer.
  listar(usuarioId: number, limite: number): Promise<{ datos: NotificacionLeida[]; noLeidas: number }>;
  // false si no existe o es de otro usuario.
  marcarLeida(id: number, usuarioId: number, ahora: Date): Promise<NotificacionLeida | null>;
  marcarTodas(usuarioId: number, ahora: Date): Promise<void>;
  // Borra las leídas antes de `antesDe`. Devuelve cuántas borró.
  purgarLeidas(antesDe: Date): Promise<number>;
}
