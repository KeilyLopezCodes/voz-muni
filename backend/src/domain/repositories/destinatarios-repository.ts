import type { TicketAlcance, UsuarioAlcance } from '../autorizacion/alcance-tickets';

// Grupos de destinatarios de las notificaciones (SPEC 31, 32 y 36). Las reglas dependen de permisos y alcances,
// nunca del nombre del rol.
export interface DestinatariosRepository {
  // Usuarios activos de la dependencia cuyo rol tiene tickets.ver con alcance `dependencia`.
  coordinadores(dependenciaId: number): Promise<number[]>;
  // Usuarios activos cuyo rol tiene tickets.triage.
  supervisores(): Promise<number[]>;
  // Autores de comentarios de la queja que no son el solicitante.
  participantes(ticketId: number): Promise<number[]>;
  // Los usuarios activos de la lista, con sus permisos, para filtrar por alcance.
  activos(ids: readonly number[]): Promise<UsuarioAlcance[]>;
  // Campos de acceso de la queja.
  ticket(ticketId: number): Promise<TicketAlcance | null>;
}
