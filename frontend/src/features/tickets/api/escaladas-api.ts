import { apiClient } from '../../../shared/api/http-client'
import type { SlaDto, TipoPlazo } from './tickets-api'
import type { Prioridad } from './triage-api'

// Contratos de SPEC 32: la bandeja de quejas escaladas del supervisor (tickets.triage).

export type EstadoEscalada = 'asignada' | 'en_proceso' | 'en_espera' | 'en_revision'

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketEscalado {
  id: number
  numero: string
  titulo: string
  estado: EstadoEscalada
  prioridad: Prioridad
  categoria: { id: number; nombre: string }
  dependencia: { id: number; nombre: string } | null // null en revisión tras un traslado
  tecnico: { id: number; nombre: string } | null
  escaladoEn: string // ISO 8601 en UTC
  escaladoPor: TipoPlazo
  sla: SlaDto
}

export interface PaginaEscaladas {
  datos: TicketEscalado[]
  pagina: number
  tamano: number
  total: number
}

export const TAMANO_PAGINA_ESCALADAS = 20

export const CLAVES_ESCALADAS = {
  bandeja: ['tickets', 'escaladas'] as const,
}

export function listarEscaladas(dependenciaId: number | null, pagina: number): Promise<PaginaEscaladas> {
  const query = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO_PAGINA_ESCALADAS) })
  if (dependenciaId !== null) {
    query.set('dependenciaId', String(dependenciaId))
  }
  return apiClient.get<PaginaEscaladas>(`/tickets/escaladas?${query}`)
}
