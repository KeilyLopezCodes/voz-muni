import { apiClient } from '../../../shared/api/http-client'

export interface DatosRegistro {
  nombre: string
  dpi: string
  email: string
  telefono?: string
  password: string
}

interface Mensaje {
  mensaje: string
}

// Responde siempre 202 con datos válidos (SPEC 16): no revela si el correo o el DPI existen.
export function registrar(datos: DatosRegistro): Promise<Mensaje> {
  return apiClient.post<Mensaje>('/auth/registro', datos)
}

export function verificar(token: string): Promise<Mensaje> {
  return apiClient.post<Mensaje>('/auth/verificar', { token })
}
