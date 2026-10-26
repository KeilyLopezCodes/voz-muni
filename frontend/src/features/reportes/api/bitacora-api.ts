import { apiClient } from '../../../shared/api/http-client'
import type { Rol } from '../../../shared/auth/roles'

// Contratos de SPEC 41: la consulta de la bitácora (bitacora.ver), de solo lectura.

export type Cambios = Record<string, { antes: unknown; despues: unknown }>

export interface RegistroBitacora {
  id: number
  creadoEn: string // ISO 8601 en UTC
  accion: string // `entidad.verbo` del catálogo del backend
  entidad: string
  entidadId: string | null
  ticketNumero: string | null // en las acciones sobre una queja o su encuesta
  usuario: { id: number; nombre: string; rol: Rol } | null // null = el sistema
  dependencia: { id: number; nombre: string } | null
  ip: string | null
  detalle: { cambios?: Cambios; datos?: Record<string, unknown> } // ya saneado por el backend
}

export interface PaginaBitacora {
  datos: RegistroBitacora[]
  siguienteCursor: string | null
}

export interface AccionCatalogo {
  accion: string
  entidad: string
}

// Fechas YYYY-MM-DD en America/Guatemala; `hasta` incluido.
export interface FiltrosBitacora {
  desde: string
  hasta: string
  acciones: string[]
  numero: string | null
  usuarioId: number | null
}

export const CLAVES_BITACORA = {
  acciones: ['bitacora', 'acciones'] as const,
  lista: (filtros: FiltrosBitacora) => ['bitacora', 'lista', filtros] as const,
}

export function consultarBitacora(filtros: FiltrosBitacora, cursor: string | null): Promise<PaginaBitacora> {
  const query = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta })
  for (const accion of filtros.acciones) {
    query.append('accion', accion)
  }
  if (filtros.numero !== null) query.set('numero', filtros.numero)
  if (filtros.usuarioId !== null) query.set('usuarioId', String(filtros.usuarioId))
  if (cursor !== null) query.set('cursor', cursor)
  return apiClient.get<PaginaBitacora>(`/bitacora?${query}`)
}

export async function listarAcciones(): Promise<AccionCatalogo[]> {
  return (await apiClient.get<{ datos: AccionCatalogo[] }>('/bitacora/acciones')).datos
}
