import type { Accion, Alcance, Permisos } from '../auth/permisos';
import type { TicketAlcance } from '../autorizacion/alcance-tickets';

// Quién coordina una dependencia: el rol cuyo tickets.ver tiene este alcance (SPEC 08). La regla depende del
// alcance, no del nombre del rol, ni de dependencias.coordinador_id (SPEC 31).
export const ALCANCE_COORDINACION: Alcance = 'dependencia';

// Quién atiende los escalamientos y decide los traslados: los roles con esta acción, con cualquier alcance (hoy, el
// supervisor). tickets.ver = 'todas' incluiría también al administrador (SPEC 32).
export const ACCION_SUPERVISION: Accion = 'tickets.triage';

// Un posible destinatario, con lo que necesita el filtro de alcance de SPEC 11.
export interface UsuarioDestino {
  id: number;
  activo: boolean;
  dependenciaId: number | null;
  permisos: Permisos;
}

// Grupos de destinatarios de las notificaciones internas (SPEC 31, 32 y 36), por permiso y alcance, nunca por el
// nombre del rol. Se usa dentro de una Transaccion: lo que lee ve los cambios del caso de uso que aún no se confirmaron.
export interface DestinatariosRepository {
  // Usuarios activos de la dependencia cuyo rol tiene tickets.ver = ALCANCE_COORDINACION, por id.
  coordinadores(dependenciaId: number): Promise<number[]>;
  // Usuarios activos cuyo rol tiene ACCION_SUPERVISION, por id.
  supervisores(): Promise<number[]>;
  // Autores de comentarios de la queja que no son su solicitante, por id.
  participantes(ticketId: number): Promise<number[]>;
  // Los usuarios que existen de `ids`, activos o no, con su dependencia y los permisos de su rol.
  usuarios(ids: readonly number[]): Promise<UsuarioDestino[]>;
  // Las columnas de la queja que usa el filtro de alcance, tal como están en esta transacción. null si no existe.
  alcanceTicket(ticketId: number): Promise<TicketAlcance | null>;
}
