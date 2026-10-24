import { apiClient } from '../../../shared/api/http-client'
import type { Rol } from '../../../shared/auth/roles'

// Contratos de SPEC 23: comentarios públicos y notas internas de una queja.

export const CUERPO_MAX = 4000

export interface Comentario {
  id: number
  cuerpo: string
  interno: boolean
  autor: { id: number; nombre: string; rol: Rol }
  esDelSolicitante: boolean
  creadoEn: string // ISO 8601 en UTC
  editadoEn: string | null
  editable: boolean // el usuario es el autor y no pasaron 5 minutos
}

export interface ComentarioCreado {
  comentario: Comentario
  ticket: { id: number; estado: string } // el estado después de comentar
}

export const CLAVES_COMENTARIOS = {
  hilo: (ticketId: number) => ['tickets', 'comentarios', ticketId] as const,
}

export function listarComentarios(ticketId: number): Promise<{ datos: Comentario[] }> {
  return apiClient.get<{ datos: Comentario[] }>(`/tickets/${ticketId}/comentarios`)
}

export function comentar(ticketId: number, datos: { cuerpo: string; interno: boolean }): Promise<ComentarioCreado> {
  return apiClient.post<ComentarioCreado>(`/tickets/${ticketId}/comentarios`, datos)
}

export function editarComentario(ticketId: number, comentarioId: number, cuerpo: string): Promise<Comentario> {
  return apiClient.patch<Comentario>(`/tickets/${ticketId}/comentarios/${comentarioId}`, { cuerpo })
}
