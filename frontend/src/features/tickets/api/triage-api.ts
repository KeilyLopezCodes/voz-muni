import { apiClient } from '../../../shared/api/http-client'
import type { ValorExtra } from './registro-api'

// Contratos de SPEC 19: bandeja del triage y transiciones del supervisor.

export const ESTADOS_TRIAGE = ['nueva', 'en_revision'] as const
export type EstadoTriage = (typeof ESTADOS_TRIAGE)[number]

export type FiltroTriage = EstadoTriage | 'todas'

export const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const
export type Prioridad = (typeof PRIORIDADES)[number]

// Del solicitante solo llega el nombre (RNF-12).
export interface TicketTriage {
  id: number
  numero: string
  estado: EstadoTriage
  titulo: string
  descripcion: string
  categoria: { id: number; nombre: string }
  zona: { id: number; nombre: string; tipo: string }
  direccion: string
  canal: string
  datosExtra: Record<string, ValorExtra>
  ubicacion: { lat: number; lng: number } | null
  solicitanteNombre: string
  creadoEn: string // ISO 8601 en UTC
}

export interface PaginaTriage {
  datos: TicketTriage[]
  pagina: number
  tamano: number
  total: number
}

export type ComandoTriage =
  | { accion: 'tomar' }
  | { accion: 'aceptar'; prioridad: Prioridad; categoriaId?: number }
  | { accion: 'rechazar'; motivo: string }

export interface TransicionHecha {
  id: number
  numero: string
  estado: string
  prioridad: Prioridad | null
  categoriaId: number
  dependenciaId: number | null
}

export const TAMANO_PAGINA = 20

// La bandeja completa se invalida con la primera parte de la clave.
export const CLAVES_TRIAGE = {
  bandeja: ['tickets', 'triage'],
} as const

export function listarTriage(filtro: FiltroTriage, pagina: number): Promise<PaginaTriage> {
  const query = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  if (filtro !== 'todas') {
    query.set('estado', filtro)
  }
  return apiClient.get<PaginaTriage>(`/tickets/triage?${query}`)
}

export function transicionar(id: number, comando: ComandoTriage): Promise<TransicionHecha> {
  return apiClient.post<TransicionHecha>(`/tickets/${id}/transiciones`, comando)
}
