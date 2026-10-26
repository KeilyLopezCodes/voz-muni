import type { TipoNotificacion } from '../notificaciones/tipos-notificacion';

// Notificaciones dentro de la aplicación (RF-32, SPEC 31 y 36). Los tipos viven en tipos-notificacion.ts.
export { TIPOS_NOTIFICACION, type TipoNotificacion } from '../notificaciones/tipos-notificacion';

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
  // comentario_nuevo agrupada (SPEC 36): si el usuario ya tiene una sin leer de la queja, suma 1 a la cantidad, marca
  // incluyeInternas si este comentario es interno y la sube (creado_en = ahora); si no, crea una con cantidad 1.
  agruparComentario(usuarioId: number, ticketId: number, interno: boolean, ahora: Date): Promise<void>;
  // Borra las leídas con leida_en anterior a `leidasAntesDe`. Devuelve cuántas borró (SPEC 36).
  purgarLeidas(leidasAntesDe: Date): Promise<number>;
  // Las `limite` más recientes del usuario (creado_en DESC, id DESC).
  listar(usuarioId: number, limite: number): Promise<NotificacionLeida[]>;
  contarNoLeidas(usuarioId: number): Promise<number>;
  // null si no existe o es de otro usuario. leida_en guarda la primera lectura (SPEC 36).
  marcarLeida(usuarioId: number, id: number, ahora: Date): Promise<NotificacionLeida | null>;
  marcarTodasLeidas(usuarioId: number, ahora: Date): Promise<void>;
}
