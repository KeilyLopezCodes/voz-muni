import { apiClient } from '../../../shared/api/http-client'
import type { Rol } from '../../../shared/auth/roles'

// Contratos de SPEC 21: solicitudes de traslado entre dependencias.

export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'retirada', 'sin_efecto'] as const
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number]

export interface SolicitudTraslado {
  id: number
  estado: EstadoSolicitud
  motivo: string
  ticket: { id: number; numero: string; titulo: string; estado: string }
  dependenciaOrigen: { id: number; nombre: string }
  dependenciaSugerida: { id: number; nombre: string } | null
  solicitadoPor: { id: number; nombre: string; rol: Rol }
  resueltoPor: { id: number; nombre: string } | null
  motivoResolucion: string | null
  creadoEn: string // ISO 8601 en UTC
  resueltoEn: string | null
}

export interface PaginaTraslados {
  datos: SolicitudTraslado[]
  pagina: number
  tamano: number
  total: number
}

// `ticket` solo viene cuando la queja cambió (traslado directo o aprobación).
export interface ResultadoTraslado {
  solicitud: SolicitudTraslado
  ticket?: { id: number; numero: string; estado: 'en_revision' }
}

export interface DatosSolicitudTraslado {
  motivo: string
  dependenciaSugeridaId?: number
}

export interface Dependencia {
  id: number
  nombre: string
}

export const TAMANO_PAGINA = 20

export const CLAVES_TRASLADOS = {
  bandeja: ['tickets', 'traslados'],
  dependencias: ['tickets', 'dependencias'],
} as const

export function listarTraslados(estado: EstadoSolicitud, pagina: number): Promise<PaginaTraslados> {
  const query = new URLSearchParams({ estado, pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  return apiClient.get<PaginaTraslados>(`/traslados?${query}`)
}

export function aprobarTraslado(id: number): Promise<ResultadoTraslado> {
  return apiClient.post<ResultadoTraslado>(`/traslados/${id}/aprobacion`, {})
}

export function rechazarTraslado(id: number, motivo: string): Promise<ResultadoTraslado> {
  return apiClient.post<ResultadoTraslado>(`/traslados/${id}/rechazo`, { motivo })
}

// El técnico o el coordinador crean una solicitud pendiente; el supervisor traslada en el momento.
export function solicitarTraslado(ticketId: number, datos: DatosSolicitudTraslado): Promise<ResultadoTraslado> {
  return apiClient.post<ResultadoTraslado>(`/tickets/${ticketId}/traslados`, datos)
}

export function listarDependencias(): Promise<Dependencia[]> {
  return apiClient.get<Dependencia[]>('/dependencias')
}
