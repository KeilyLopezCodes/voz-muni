import { apiClient } from '../../../shared/api/http-client'
import type { EstadoTicket } from './tickets-api'

// Contrato de SPEC 37: GET /public/tickets/:numero?contacto=, sin sesión. Nunca trae datos personales ni ids.

export type ActorPublico = 'vecino' | 'municipalidad' | 'sistema'

export interface ConsultaPublica {
  numero: string
  titulo: string
  estado: EstadoTicket
  categoria: string
  zona: string
  creadoEn: string // ISO 8601 en UTC
  resueltoEn: string | null
  cerradoEn: string | null
  cierreAutomatico: boolean
  esperaRespuesta: boolean
  solucion: { descripcion: string; resueltaEn: string } | null
  confirmacion: { venceEn: string; vencida: boolean } | null
  lineaTiempo: {
    ocurridoEn: string
    actor: ActorPublico
    estadoAnterior: EstadoTicket | null
    estadoNuevo: EstadoTicket
    motivo: string | null
  }[]
  comentarios: {
    cuerpo: string
    autor: Exclude<ActorPublico, 'sistema'>
    creadoEn: string
    editadoEn: string | null
  }[]
}

// Formato de los números de queja (SPEC 12). El backend acepta minúsculas.
export const PATRON_NUMERO = /^Q-\d{4}-\d{6}$/i

// El contacto viaja en la query de esta petición (sección 6 del documento), nunca en la URL del navegador.
export function consultarQueja(numero: string, contacto: string): Promise<ConsultaPublica> {
  const query = new URLSearchParams({ contacto })
  return apiClient.get<ConsultaPublica>(`/public/tickets/${encodeURIComponent(numero)}?${query.toString()}`)
}
