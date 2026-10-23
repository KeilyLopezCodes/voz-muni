import { apiClient } from '../../../shared/api/http-client'

export interface DatosRegistro {
  nombre: string
  dpi: string
  email: string
  telefono?: string
  password: string
}

interface RespuestaMensaje {
  mensaje: string
}

// Responde 202 con el mismo cuerpo exista o no la cuenta (SPEC 16).
export function registrar(datos: DatosRegistro): Promise<RespuestaMensaje> {
  return apiClient.post<RespuestaMensaje>('/auth/registro', datos)
}

export function verificar(token: string): Promise<RespuestaMensaje> {
  return apiClient.post<RespuestaMensaje>('/auth/verificar', { token })
}
