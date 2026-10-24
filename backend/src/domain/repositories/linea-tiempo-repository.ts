import type { Rol } from '../auth/roles';
import type { EstadoTicket } from '../ticket/estado-ticket';

// Línea de tiempo de una queja (RF-25, SPEC 28): unión en vivo de cinco tablas, sin tabla propia.
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
  | { tipo: 'sistema' }; // usuario_id NULL

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

// Tal como sale de la base: el actor siempre como usuario (o null = sistema). El servicio arma la vista.
export interface EventoLeido {
  id: string; // `${tipo}:${idDeOrigen}`, único dentro de la queja
  ocurridoEn: Date;
  ocurridoUs: string; // el mismo instante en ISO con microsegundos, para el cursor
  actor: { id: number; nombre: string; rol: Rol } | null;
  detalle: DetalleEvento;
}

export interface FiltroLineaTiempo {
  vistaPublica: boolean; // omite asignaciones y traslados
  incluirInternos: boolean; // comentarios.interno: notas y adjuntos internos
  antesDe: { ocurridoEn: string; id: string } | null; // ocurridoEn con microsegundos
  limite: number;
}

export interface LineaTiempoRepository {
  // Orden ocurridoEn DESC, id DESC. Con antesDe, solo los eventos estrictamente anteriores.
  listar(ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLeido[]>;
}
