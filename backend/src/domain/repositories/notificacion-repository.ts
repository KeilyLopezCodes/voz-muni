// Notificaciones dentro de la aplicación (RF-32, SPEC 31). El texto no se guarda: lo arma el frontend con `tipo` y
// `datos` y los archivos de traducción.

// Tipos conocidos hoy. notificaciones.tipo no tiene CHECK (SPEC 03): RF-32 agregará más.
export const TIPOS_NOTIFICACION = ['sla_alerta_respuesta', 'sla_alerta_resolucion'] as const;

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

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
  crear(notificaciones: readonly NuevaNotificacion[]): Promise<void>;
  // Las `limite` más recientes del usuario (creado_en DESC, id DESC).
  listar(usuarioId: number, limite: number): Promise<NotificacionLeida[]>;
  contarNoLeidas(usuarioId: number): Promise<number>;
  // null si no existe o es de otro usuario.
  marcarLeida(usuarioId: number, id: number): Promise<NotificacionLeida | null>;
  marcarTodasLeidas(usuarioId: number): Promise<void>;
}
