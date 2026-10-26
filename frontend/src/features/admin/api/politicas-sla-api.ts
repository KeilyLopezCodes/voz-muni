import { apiClient } from '../../../shared/api/http-client'

// Contratos de SPEC 29: la matriz de SLA de cada categoría, solo para el administrador (admin.catalogos).

// Mismo orden que PRIORIDADES del backend (domain/ticket/prioridad.ts): de baja a urgente.
export const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const
export type Prioridad = (typeof PRIORIDADES)[number]

export interface PlazoSla {
  prioridad: Prioridad
  horasRespuesta: number // horas hábiles hasta la primera respuesta
  horasResolucion: number // horas hábiles hasta la resolución
}

export interface CategoriaSla {
  categoria: { id: number; nombre: string; activa: boolean }
  dependencia: { id: number; nombre: string }
  plazos: PlazoSla[] // las que existan, de baja a urgente
  completa: boolean // tiene las 4 prioridades
  actualizadoEn: string | null // ISO 8601 en UTC
  actualizadoPor: { id: number; nombre: string } | null // null en lo que no cargó el administrador
}

export type ProblemaMatriz =
  | 'PRIORIDAD_FALTANTE'
  | 'PRIORIDAD_DUPLICADA'
  | 'HORAS_INVALIDAS'
  | 'RESPUESTA_MAYOR_QUE_RESOLUCION'
  | 'NO_MONOTONA'

export interface DetalleMatriz {
  prioridad: Prioridad
  campo: 'horasRespuesta' | 'horasResolucion' | null
  problema: ProblemaMatriz
}

export const CLAVES_POLITICAS_SLA = {
  lista: ['admin', 'politicas-sla'] as const,
}

export function listarPoliticasSla(): Promise<{ datos: CategoriaSla[] }> {
  return apiClient.get<{ datos: CategoriaSla[] }>('/admin/politicas-sla')
}

export function reemplazarPoliticasSla(categoriaId: number, plazos: PlazoSla[]): Promise<CategoriaSla> {
  return apiClient.put<CategoriaSla>(`/admin/categorias/${categoriaId}/politicas-sla`, { plazos })
}
