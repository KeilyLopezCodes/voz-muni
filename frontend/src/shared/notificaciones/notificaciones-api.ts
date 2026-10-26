import { apiClient } from '../api/http-client'

// Contratos de SPEC 31: las notificaciones del propio usuario. El texto lo arma la interfaz con `tipo` y `datos`.

export interface Notificacion {
  id: number
  tipo: string // 'sla_alerta_respuesta' | 'sla_alerta_resolucion' por ahora (RF-32 agregará más)
  leida: boolean
  creadoEn: string // ISO 8601 en UTC
  ticket: { id: number; numero: string; titulo: string } | null
  datos: Record<string, unknown>
}

export interface ListaNotificaciones {
  datos: Notificacion[] // las 20 más recientes
  noLeidas: number
}

export const CLAVES_NOTIFICACIONES = {
  lista: ['notificaciones'] as const,
}

// Cada cuánto se vuelven a pedir (además de al recuperar el foco).
export const INTERVALO_NOTIFICACIONES_MS = 60_000

export function listarNotificaciones(): Promise<ListaNotificaciones> {
  return apiClient.get<ListaNotificaciones>('/notificaciones')
}

export function marcarNotificacion(id: number): Promise<Notificacion> {
  return apiClient.patch<Notificacion>(`/notificaciones/${id}`, { leida: true })
}

export function marcarTodasLeidas(): Promise<void> {
  return apiClient.post<void>('/notificaciones/marcar-leidas', {})
}
