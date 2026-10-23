import { ApiError } from '../../../shared/api/api-error'
import { refrescar, type RespuestaSesion } from '../api/auth-api'
import { borrarRefresh, guardarRefresh, leerRefresh } from './almacen-sesion'

// Único camino para renovar la sesión (SPEC 17). El backend rota el token en cada renovación y,
// si recibe uno ya rotado, revoca todas las sesiones del usuario (SPEC 08). Por eso:
// - dentro de una pestaña, las renovaciones simultáneas comparten una sola promesa;
// - entre pestañas, se serializan con navigator.locks y cada una relee localStorage al obtener el lock.
export const NOMBRE_LOCK = 'vozmuni-refresh'

let enCurso: Promise<RespuestaSesion | null> | null = null

// Devuelve la RespuestaSesion nueva, o null si no hay sesión válida.
// Un error de red se propaga: no es motivo para cerrar la sesión.
export function renovar(): Promise<RespuestaSesion | null> {
  enCurso ??= conLock().finally(() => {
    enCurso = null
  })
  return enCurso
}

function conLock(): Promise<RespuestaSesion | null> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  // Sin navigator.locks (navegadores viejos) queda solo la promesa compartida de esta pestaña.
  return locks ? locks.request(NOMBRE_LOCK, renovarConTokenActual) : renovarConTokenActual()
}

async function renovarConTokenActual(): Promise<RespuestaSesion | null> {
  // Se lee ya con el lock: si otra pestaña renovó mientras esperábamos, aquí está su token nuevo
  // y no se presenta el viejo, que el backend tomaría como reuso.
  // Riesgo aceptado (SPEC 17): Chromium propaga localStorage entre pestañas de forma asíncrona, así que
  // en una renovación simultánea esta lectura todavía puede devolver el token recién rotado por otra pestaña.
  const token = leerRefresh()
  if (!token) {
    return null
  }
  try {
    const respuesta = await refrescar(token)
    guardarRefresh(respuesta.refreshToken)
    return respuesta
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      borrarRefresh()
      return null
    }
    throw error
  }
}
