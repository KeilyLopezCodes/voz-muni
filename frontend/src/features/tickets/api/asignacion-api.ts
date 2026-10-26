import { apiClient } from '../../../shared/api/http-client'
import type { SlaDto } from './tickets-api'
import type { Prioridad } from './triage-api'

// Contratos de SPEC 20: bandeja de asignación, técnicos con carga y asignación.

export const VISTAS_POR_ASIGNAR = ['sin_tecnico', 'abiertas'] as const
export type VistaPorAsignar = (typeof VISTAS_POR_ASIGNAR)[number]

export type EstadoAbierto = 'asignada' | 'en_proceso' | 'en_espera'

// Sin datos de contacto ni DPI del solicitante (RNF-12).
export interface TicketPorAsignar {
  id: number
  numero: string
  estado: EstadoAbierto
  prioridad: Prioridad
  titulo: string
  categoria: { id: number; nombre: string }
  dependencia: { id: number; nombre: string }
  zona: { id: number; nombre: string; tipo: string }
  tecnico: { id: number; nombre: string } | null
  creadoEn: string // ISO 8601 en UTC
  sla: SlaDto // vencimientos (SPEC 30)
}

export interface PaginaPorAsignar {
  datos: TicketPorAsignar[]
  pagina: number
  tamano: number
  total: number
}

export interface TecnicoConCarga {
  id: number
  nombre: string
  carga: number // quejas en asignada, en_proceso o en_espera
}

export interface DatosAsignacion {
  tecnicoId: number
  motivo?: string // obligatorio al reasignar
}

export interface AsignacionHecha {
  id: number
  numero: string
  estado: EstadoAbierto
  asignadoA: number
  tecnicoAnterior: number | null
}

export const TAMANO_PAGINA = 20

// La bandeja completa se invalida con la primera parte de la clave.
export const CLAVES_ASIGNACION = {
  bandeja: ['tickets', 'por-asignar'],
  tecnicos: (dependenciaId: number) => ['tickets', 'asignacion', 'tecnicos', dependenciaId] as const,
} as const

export function listarPorAsignar(vista: VistaPorAsignar, pagina: number): Promise<PaginaPorAsignar> {
  const query = new URLSearchParams({ vista, pagina: String(pagina), tamano: String(TAMANO_PAGINA) })
  return apiClient.get<PaginaPorAsignar>(`/tickets/por-asignar?${query}`)
}

export function listarTecnicos(dependenciaId: number): Promise<TecnicoConCarga[]> {
  return apiClient.get<TecnicoConCarga[]>(`/dependencias/${dependenciaId}/tecnicos`)
}

export function asignarTecnico(id: number, datos: DatosAsignacion): Promise<AsignacionHecha> {
  return apiClient.patch<AsignacionHecha>(`/tickets/${id}/asignacion`, datos)
}
