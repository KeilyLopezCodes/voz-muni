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
  confirmacionVenceEn: string | null // ISO 8601 en UTC; solo en resuelta (SPEC 38)
  pendienteCalificar: boolean // el vecino puede calificar esta queja cerrada (SPEC 39)
}

// La encuesta de satisfacción de una queja cerrada (SPEC 39).
export interface EncuestaDetalle {
  calificacion: number
  comentario: string | null
  creadoEn: string // ISO 8601 en UTC
}

export const CALIFICACION_MAX = 5
export const COMENTARIO_ENCUESTA_MAX = 1000

// GET /tickets/resumen (SPEC 38): cuántas hay en cada estado, con la misma búsqueda que el listado.
export interface ResumenTickets {
  porEstado: Record<EstadoTicket, number>
  total: number
}

// Filtros de GET /tickets (SPEC 38): estados genéricos y una búsqueda de 2 a 100 caracteres.
export interface FiltrosListado {
  estados: readonly EstadoTicket[]
  q: string | null
  pagina: number
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

// Los dos plazos del SLA (SPEC 30).
export type TipoPlazo = 'respuesta' | 'resolucion'

// Vencimientos del SLA para los internos (SPEC 30). "Vencido" se calcula aquí con la hora actual.
export interface SlaDto {
  venceRespuesta: string | null // ISO 8601 en UTC
  primeraRespuestaEn: string | null
  venceResolucion: string | null // null mientras está en pausa
  pausado: boolean // estado === 'en_espera'
  restanteMinutosEnPausa: number | null // minutos hábiles que faltaban al entrar en espera
  escalado: boolean // venció un plazo (SPEC 32)
  escaladoEn: string | null
  escaladoPor: TipoPlazo | null
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
  sla: SlaDto | null // null para el vecino (SPEC 30)
  cierreAutomatico: boolean // cerrada por el job de SLA al vencer el plazo de confirmación (SPEC 33)
  encuesta: EncuestaDetalle | null // SPEC 39
  puedeCalificar: boolean // solo el solicitante, en cerrada, sin encuesta y dentro del plazo
  encuestaVenceEn: string | null // solo si puedeCalificar
}

export const TAMANO_PAGINA = 20

export const BUSQUEDA_MIN = 2
export const BUSQUEDA_MAX = 100

// Invalidar `listado` o `resumen` alcanza todas sus variantes de filtros.
export const CLAVES_TICKETS = {
  listado: ['tickets', 'listado'] as const,
  listadoCon: (filtros: FiltrosListado) => ['tickets', 'listado', filtros] as const,
  resumen: ['tickets', 'resumen'] as const,
  resumenCon: (q: string | null) => ['tickets', 'resumen', { q }] as const,
  detalle: (id: number) => ['tickets', 'detalle', id] as const,
}

export function listarTickets({ estados, q, pagina }: FiltrosListado): Promise<PaginaTickets> {
  const query = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  estados.forEach((estado) => query.append('estado', estado))
  if (q !== null) {
    query.set('q', q)
  }
  return apiClient.get<PaginaTickets>(`/tickets?${query}`)
}

export function resumenTickets(q: string | null): Promise<ResumenTickets> {
  return apiClient.get<ResumenTickets>(q === null ? '/tickets/resumen' : `/tickets/resumen?${new URLSearchParams({ q })}`)
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

// POST /tickets/:id/encuesta (SPEC 39): una sola vez, solo el solicitante.
export function enviarEncuesta(id: number, calificacion: number, comentario?: string): Promise<EncuestaDetalle> {
  return apiClient.post<EncuestaDetalle>(`/tickets/${id}/encuesta`, comentario === undefined ? { calificacion } : { calificacion, comentario })
}
