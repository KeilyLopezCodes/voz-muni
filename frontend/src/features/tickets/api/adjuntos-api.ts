import { apiClient } from '../../../shared/api/http-client'
import type { Rol } from '../../../shared/auth/roles'

// Contratos de SPEC 24: adjuntos del registro y evidencias de la atención.

export interface Adjunto {
  id: number
  nombre: string
  mime: string
  tamanoBytes: number
  interno: boolean
  origen: 'registro' | 'atencion'
  subidoPor: { id: number; nombre: string; rol: Rol }
  creadoEn: string // ISO 8601 en UTC
  borrable: boolean // el usuario es el autor y no pasaron 5 minutos
}

export const CLAVES_ADJUNTOS = {
  lista: (ticketId: number) => ['tickets', 'adjuntos', ticketId] as const,
}

export function listarAdjuntos(ticketId: number): Promise<{ datos: Adjunto[] }> {
  return apiClient.get<{ datos: Adjunto[] }>(`/tickets/${ticketId}/adjuntos`)
}

// `interno` solo aplica a las evidencias de la atención; el origen lo decide el backend.
export function subirAdjuntos(ticketId: number, archivos: readonly File[], interno?: boolean): Promise<{ adjuntos: Adjunto[] }> {
  const form = new FormData()
  for (const archivo of archivos) {
    form.append('archivos', archivo, archivo.name)
  }
  if (interno !== undefined) {
    form.append('interno', String(interno))
  }
  return apiClient.postForm<{ adjuntos: Adjunto[] }>(`/tickets/${ticketId}/adjuntos`, form)
}

export function descargarAdjunto(ticketId: number, adjuntoId: number): Promise<Blob> {
  return apiClient.descargar(`/tickets/${ticketId}/adjuntos/${adjuntoId}/contenido`)
}

export function borrarAdjunto(ticketId: number, adjuntoId: number): Promise<void> {
  return apiClient.delete<void>(`/tickets/${ticketId}/adjuntos/${adjuntoId}`)
}
