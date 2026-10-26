import { apiClient } from '../../../shared/api/http-client'
import type { Rol } from '../../../shared/auth/roles'
import type { EstadoTicket, TipoPlazo } from './tickets-api'

// Contratos de SPEC 28: GET /tickets/:id/linea-tiempo, de la más reciente a la más antigua, paginada por cursor.
// Qué eventos y qué motivos llegan lo decide el backend con el alcance del usuario.

export type ActorEvento =
  | { tipo: 'usuario'; id: number; nombre: string; rol: Rol; esSolicitante: boolean }
  | { tipo: 'tu' }
  | { tipo: 'municipalidad' }
  | { tipo: 'sistema' }

export type DetalleEvento =
  | { tipo: 'estado'; estadoAnterior: EstadoTicket | null; estadoNuevo: EstadoTicket; motivo: string | null }
  | {
      tipo: 'asignacion'
      tecnicoAnterior: { id: number; nombre: string } | null
      tecnicoNuevo: { id: number; nombre: string }
      motivo: string | null
    }
  | {
      tipo: 'traslado_solicitado'
      solicitudId: number
      dependenciaOrigen: string
      dependenciaSugerida: string | null
      motivo: string
    }
  | { tipo: 'traslado_rechazado' | 'traslado_retirado' | 'traslado_sin_efecto'; solicitudId: number; motivo: string | null }
  | { tipo: 'comentario'; comentarioId: number; interno: boolean }
  | { tipo: 'adjunto'; adjuntoId: number; nombre: string; interno: boolean }
  | { tipo: 'escalamiento'; plazo: TipoPlazo } // SPEC 32, solo en la vista interna

export interface EventoLineaTiempo {
  id: string // `${tipo}:${idDeOrigen}`
  ocurridoEn: string // ISO 8601 en UTC
  actor: ActorEvento
  detalle: DetalleEvento
}

export interface PaginaLineaTiempo {
  datos: EventoLineaTiempo[]
  siguienteCursor: string | null // null: no hay eventos anteriores
}

export const CLAVES_LINEA_TIEMPO = {
  lista: (ticketId: number) => ['tickets', ticketId, 'linea-tiempo'] as const,
}

export function listarLineaTiempo(ticketId: number, cursor: string | null): Promise<PaginaLineaTiempo> {
  const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`
  return apiClient.get<PaginaLineaTiempo>(`/tickets/${ticketId}/linea-tiempo${query}`)
}
