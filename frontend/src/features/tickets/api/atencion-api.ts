import { apiClient } from '../../../shared/api/http-client'
import type { ValorExtra } from './registro-api'
import type { Prioridad } from './triage-api'

// Contratos de SPEC 22: bandeja de atención y acciones de cambio de estado.

export const ESTADOS_ATENCION = ['asignada', 'en_proceso', 'en_espera'] as const
export type EstadoAtencion = (typeof ESTADOS_ATENCION)[number]

export type FiltroAtencion = EstadoAtencion | 'todas'

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketAtencion {
  id: number
  numero: string
  estado: EstadoAtencion
  prioridad: Prioridad
  titulo: string
  descripcion: string
  categoria: { id: number; nombre: string }
  dependencia: { id: number; nombre: string }
  zona: { id: number; nombre: string; tipo: string }
  direccion: string
  datosExtra: Record<string, ValorExtra>
  ubicacion: { lat: number; lng: number } | null
  tecnico: { id: number; nombre: string } | null
  motivoEspera: string | null // lo que se pidió al vecino, si está en espera
  trasladoPendiente: boolean
  creadoEn: string // ISO 8601 en UTC
}

export interface PaginaAtencion {
  datos: TicketAtencion[]
  pagina: number
  tamano: number
  total: number
}

export type ComandoAtencion =
  | { accion: 'iniciar' }
  | { accion: 'poner_en_espera'; motivo: string }
  | { accion: 'reanudar' }
  | { accion: 'resolver'; descripcion: string }

export interface AtencionHecha {
  id: number
  numero: string
  estado: string
  asignadoA: number | null
  resueltoEn: string | null
}

export const TAMANO_PAGINA = 20

export const CLAVES_ATENCION = {
  bandeja: ['tickets', 'atencion'],
} as const

export function listarAtencion(filtro: FiltroAtencion, pagina: number): Promise<PaginaAtencion> {
  const query = new URLSearchParams({ estado: filtro, pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  return apiClient.get<PaginaAtencion>(`/tickets/atencion?${query}`)
}

// El mismo endpoint del triage (SPEC 19): el permiso depende de la acción.
export function transicionarAtencion(id: number, comando: ComandoAtencion): Promise<AtencionHecha> {
  return apiClient.post<AtencionHecha>(`/tickets/${id}/transiciones`, comando)
}
