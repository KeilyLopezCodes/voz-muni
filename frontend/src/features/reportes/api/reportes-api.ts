import { apiClient } from '../../../shared/api/http-client'

// Contratos de SPEC 43: el tablero de quejas e indicadores de SLA (reportes.ver).

export const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const
export type Prioridad = (typeof PRIORIDADES)[number]

export interface Cumplimiento {
  cumple: number
  incumple: number
  pendiente: number
  porcentaje: number | null // null sin quejas medibles
}

export interface Indicadores {
  cantidad: number
  horasPromedioRespuesta: number | null // horas hábiles; null sin datos
  horasPromedioResolucion: number | null
  cumplimientoRespuesta: Cumplimiento
  cumplimientoResolucion: Cumplimiento
  escaladasAbiertas: number
}

export type IndicadoresDeGrupo = { id: number; nombre: string } & Indicadores

export interface ResumenReportes {
  rango: { desde: string; hasta: string }
  total: number
  porEstado: { estado: string; cantidad: number }[] // los 8
  porCategoria: { id: number; nombre: string; cantidad: number }[]
  porDependencia: { id: number | null; nombre: string | null; cantidad: number }[] // null = sin dependencia
  porZona: { id: number; nombre: string; tipo: string; cantidad: number }[]
  indicadores: Indicadores
  indicadoresPorDependencia: IndicadoresDeGrupo[]
  indicadoresPorCategoria: IndicadoresDeGrupo[]
  generadoEn: string
}

// Fechas YYYY-MM-DD de registro en America/Guatemala; los filtros opcionales nunca amplían el alcance.
export interface FiltrosReportes {
  desde: string
  hasta: string
  dependenciaId: number | null
  categoriaId: number | null
  zonaId: number | null
  prioridad: Prioridad | null
}

export const CLAVES_REPORTES = {
  resumen: (filtros: FiltrosReportes) => ['reportes', 'resumen', filtros] as const,
}

export function obtenerResumen(filtros: FiltrosReportes): Promise<ResumenReportes> {
  const query = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta })
  if (filtros.dependenciaId !== null) query.set('dependenciaId', String(filtros.dependenciaId))
  if (filtros.categoriaId !== null) query.set('categoriaId', String(filtros.categoriaId))
  if (filtros.zonaId !== null) query.set('zonaId', String(filtros.zonaId))
  if (filtros.prioridad !== null) query.set('prioridad', filtros.prioridad)
  return apiClient.get<ResumenReportes>(`/reportes/resumen?${query}`)
}
