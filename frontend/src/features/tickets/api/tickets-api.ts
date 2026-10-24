import { apiClient } from '../../../shared/api/http-client'

// Contratos de SPEC 25: primeras versiones de GET /tickets y GET /tickets/:id. RF-36 agrega los filtros
// y RF-25 la línea de tiempo, sin quitar ni renombrar estos campos.

export const ESTADOS_TICKET = [
  'nueva',
  'en_revision',
  'asignada',
  'en_proceso',
  'en_espera',
  'resuelta',
  'cerrada',
  'rechazada',
] as const
export type EstadoTicket = (typeof ESTADOS_TICKET)[number]

// Solo cerrada y rechazada son finales (sección 3 del documento de definición).
export const esEstadoFinal = (estado: EstadoTicket) => estado === 'cerrada' || estado === 'rechazada'

export interface TicketListado {
  id: number
  numero: string
  titulo: string
  estado: EstadoTicket
  creadoEn: string // ISO 8601 en UTC
  esperaRespuesta: boolean // estado === 'en_espera'
}

export interface PaginaTickets {
  datos: TicketListado[]
  pagina: number
  tamano: number
  total: number
}

// Resolución vigente (SPEC 26), solo en resuelta o cerrada. resueltaPor es null para el vecino.
export interface ResolucionDetalle {
  descripcion: string
  resueltaEn: string // ISO 8601 en UTC
  resueltaPor: { id: number; nombre: string } | null
}

// Plazo y acciones de confirmación (SPEC 27), solo en resuelta. Los permisos los calcula el backend con el alcance
// del usuario: la interfaz solo decide qué botones mostrar.
export interface ConfirmacionDetalle {
  venceEn: string // ISO 8601 en UTC
  vencida: boolean
  reaperturasRestantes: number
  puedeConfirmar: boolean
  puedeReabrir: boolean
  exigeMotivoAlConfirmar: boolean
}

// Sin datos del solicitante, prioridad, técnico, coordenadas ni datos adicionales.
export interface TicketDetalle {
  id: number
  numero: string
  estado: EstadoTicket
  titulo: string
  descripcion: string
  categoria: { id: number; nombre: string }
  zona: { id: number; nombre: string; tipo: string }
  direccion: string
  dependencia: { id: number; nombre: string } | null
  creadoEn: string // ISO 8601 en UTC
  resueltoEn: string | null
  cerradoEn: string | null
  informacionSolicitada: string | null // lo que pidió la municipalidad, solo si está en espera
  esSolicitante: boolean
  resolucion: ResolucionDetalle | null
  confirmacion: ConfirmacionDetalle | null
}

export const TAMANO_PAGINA = 20

export const CLAVES_TICKETS = {
  listado: ['tickets', 'listado'] as const,
  detalle: (id: number) => ['tickets', 'detalle', id] as const,
}

export function listarTickets(pagina: number): Promise<PaginaTickets> {
  const query = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  return apiClient.get<PaginaTickets>(`/tickets?${query}`)
}

export function obtenerTicket(id: number): Promise<TicketDetalle> {
  return apiClient.get<TicketDetalle>(`/tickets/${id}`)
}

// Largo máximo de los motivos de confirmar y reabrir, igual que el validador del backend.
export const MOTIVO_MAX = 1000

export interface ConfirmacionHecha {
  id: number
  numero: string
  estado: EstadoTicket
  asignadoA: number | null
  resueltoEn: string | null
  cerradoEn: string | null
  reaperturas: number
}

// Mismo endpoint de las transiciones (SPEC 19 y 22): el permiso depende de la acción.
export function confirmarSolucion(id: number, motivo?: string): Promise<ConfirmacionHecha> {
  return apiClient.post<ConfirmacionHecha>(
    `/tickets/${id}/transiciones`,
    motivo === undefined ? { accion: 'confirmar' } : { accion: 'confirmar', motivo },
  )
}

export function reabrirQueja(id: number, motivo: string): Promise<ConfirmacionHecha> {
  return apiClient.post<ConfirmacionHecha>(`/tickets/${id}/transiciones`, { accion: 'reabrir', motivo })
}
