import type { Rol } from '../auth/roles';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Línea de tiempo de la queja (RF-25, SPEC 28). No tiene tabla propia: se lee en vivo de ticket_historial,
// ticket_asignaciones, solicitudes_traslado, comentarios y adjuntos.

export type TipoEvento =
  | 'estado'
  | 'asignacion'
  | 'traslado_solicitado'
  | 'traslado_rechazado'
  | 'traslado_retirado'
  | 'traslado_sin_efecto'
  | 'comentario'
  | 'adjunto';

export type ActorEvento =
  | { tipo: 'usuario'; id: number; nombre: string; rol: Rol; esSolicitante: boolean } // vista interna
  | { tipo: 'tu' } // vista pública: el propio vecino
  | { tipo: 'municipalidad' } // vista pública: cualquier otro usuario
  | { tipo: 'sistema' }; // usuario_id NULL (transiciones del sistema), en las dos vistas

export type DetalleEvento =
  | { tipo: 'estado'; estadoAnterior: EstadoTicket | null; estadoNuevo: EstadoTicket; motivo: string | null }
  | {
      tipo: 'asignacion';
      tecnicoAnterior: { id: number; nombre: string } | null;
      tecnicoNuevo: { id: number; nombre: string };
      motivo: string | null;
    }
  | {
      tipo: 'traslado_solicitado';
      solicitudId: number;
      dependenciaOrigen: string;
      dependenciaSugerida: string | null;
      motivo: string;
    }
  | {
      tipo: 'traslado_rechazado' | 'traslado_retirado' | 'traslado_sin_efecto';
      solicitudId: number;
      motivo: string | null;
    }
  | { tipo: 'comentario'; comentarioId: number; interno: boolean }
  | { tipo: 'adjunto'; adjuntoId: number; nombre: string; interno: boolean };

export interface EventoLineaTiempo {
  id: string; // `${tipo}:${idDeOrigen}`, único dentro de la queja
  ocurridoEn: string; // ISO 8601 en UTC, con milisegundos
  actor: ActorEvento;
  detalle: DetalleEvento;
}

export interface FiltroLineaTiempo {
  vistaPublica: boolean;
  incluirInternos: boolean; // comentarios.interno
  usuarioId: number;
  antesDe: { ocurridoEn: Date; id: string } | null;
  limite: number;
}

// El repositorio aplica la visibilidad de cada fuente (qué eventos se leen). Cambiar actores y motivos para la
// vista pública es tarea del servicio.
export interface LineaTiempoRepository {
  listar(ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLineaTiempo[]>;
}
