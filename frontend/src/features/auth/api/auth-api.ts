import { apiClient } from '../../../shared/api/http-client'

// Respuesta de login, refresh y restablecer (SPEC 08 y 09). El rol llega como texto:
// AuthProvider lo valida contra ROLES antes de crear la sesión.
export interface RespuestaSesion {
  accessToken: string
  accessExpiraEn: string
  refreshToken: string
  refreshExpiraEn: string
  usuario: {
    id: number
    nombre: string
    rol: string
    dependenciaId: number | null
  }
}

interface RespuestaMensaje {
  mensaje: string
}

export function login(email: string, password: string): Promise<RespuestaSesion> {
  return apiClient.post<RespuestaSesion>('/auth/login', { email, password })
}

// Solo la usa renovador.ts: nadie más llama a /auth/refresh directamente.
export function refrescar(refreshToken: string): Promise<RespuestaSesion> {
  return apiClient.post<RespuestaSesion>('/auth/refresh', { refreshToken })
}

export function logout(refreshToken: string): Promise<void> {
  return apiClient.post<void>('/auth/logout', { refreshToken })
}

// Responde 202 con el mismo cuerpo exista o no el correo (SPEC 09).
export function recuperar(email: string): Promise<RespuestaMensaje> {
  return apiClient.post<RespuestaMensaje>('/auth/recuperar', { email })
}

// Sirve para enlaces de recuperación y de invitación (SPEC 10 y 13), e inicia sesión.
export function restablecer(token: string, password: string): Promise<RespuestaSesion> {
  return apiClient.post<RespuestaSesion>('/auth/restablecer', { token, password })
}
