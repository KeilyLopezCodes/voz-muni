import { apiClient } from '../../../shared/api/http-client'
import type { EstadoTicket, SlaDto } from './tickets-api'
import type { Prioridad } from './triage-api'

// Contratos de SPEC 45: el listado general de quejas para los internos, con el alcance de tickets.ver (SPEC 11).

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketGestion {
  id: number
  numero: string
  titulo: string
  estado: EstadoTicket
  prioridad: Prioridad | null // null en nueva y en_revision
  categoria: { id: number; nombre: string }
  dependencia: { id: number; nombre: string } | null
  zona: { id: number; nombre: string }
  tecnico: { id: number; nombre: string } | null
  creadoEn: string // ISO 8601 en UTC
  sla: SlaDto
}

export interface PaginaGestion {
  datos: TicketGestion[]
  pagina: number
  tamano: number
  total: number
}

// Lo que puede elegirse en los filtros dentro del alcance; incluye las inactivas.
export interface OpcionesGestion {
  dependencias: { id: number; nombre: string; activa: boolean }[]
  categorias: { id: number; nombre: string; dependenciaId: number; activa: boolean }[]
  tecnicos: { id: number; nombre: string; dependenciaId: number; activo: boolean }[]
}

export const SIN_ASIGNAR = 'sin_asignar'

// Se combinan con AND. null: sin filtro.
export interface FiltrosGestion {
  estados: readonly EstadoTicket[]
  q: string | null // de 2 a 100 caracteres
  dependenciaId: number | null
  categoriaId: number | null
  prioridad: Prioridad | null
  desde: string | null // YYYY-MM-DD en America/Guatemala
  hasta: string | null
  tecnico: number | typeof SIN_ASIGNAR | null
  pagina: number
}

export const TAMANO_PAGINA_GESTION = 20

export const CLAVES_GESTION = {
  listado: ['tickets', 'gestion'] as const,
  listadoCon: (filtros: FiltrosGestion) => ['tickets', 'gestion', filtros] as const,
  opciones: ['tickets', 'gestion', 'opciones'] as const,
}

export function listarGestion(filtros: FiltrosGestion): Promise<PaginaGestion> {
  const query = new URLSearchParams({ pagina: String(filtros.pagina), tamano: String(TAMANO_PAGINA_GESTION) })
  filtros.estados.forEach((estado) => query.append('estado', estado))
  const opcionales: [string, string | number | null][] = [
    ['q', filtros.q],
    ['dependenciaId', filtros.dependenciaId],
    ['categoriaId', filtros.categoriaId],
    ['prioridad', filtros.prioridad],
    ['desde', filtros.desde],
    ['hasta', filtros.hasta],
    ['tecnico', filtros.tecnico],
  ]
  for (const [clave, valor] of opcionales) {
    if (valor !== null) {
      query.set(clave, String(valor))
    }
  }
  return apiClient.get<PaginaGestion>(`/tickets/gestion?${query}`)
}

export function opcionesGestion(): Promise<OpcionesGestion> {
  return apiClient.get<OpcionesGestion>('/tickets/gestion/opciones')
}
