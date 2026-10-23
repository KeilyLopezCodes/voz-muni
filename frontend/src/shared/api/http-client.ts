import { ApiError } from './api-error'

const TIEMPO_LIMITE_MS = 15_000

type TokenProvider = () => string | null

let tokenProvider: TokenProvider = () => null

// Devuelve true si consiguió un token nuevo y la petición puede repetirse (SPEC 17).
type UnauthorizedHandler = () => Promise<boolean>

let unauthorizedHandler: UnauthorizedHandler = async () => false

// La spec de autenticación conecta aquí la fuente real del token.
export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn
}

// AuthProvider conecta aquí la renovación de la sesión.
export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  unauthorizedHandler = fn
}

// /auth/* (login, refresh, logout, …) nunca dispara la renovación: evita bucles.
const esRutaDeAuth = (path: string) => path.startsWith('/auth/')

export interface HttpClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  patch<T>(path: string, body: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
}

// Cuerpo de error del backend: { "codigo": "...", "mensaje": "..." }.
async function codigoDeError(response: Response): Promise<string> {
  try {
    const cuerpo: unknown = await response.json()
    if (cuerpo && typeof cuerpo === 'object' && 'codigo' in cuerpo && typeof cuerpo.codigo === 'string') {
      return cuerpo.codigo
    }
  } catch {
    // Cuerpo vacío o no JSON: se usa el código genérico.
  }
  return `HTTP_${response.status}`
}

export function createHttpClient(baseUrl: string): HttpClient {
  // Ante un 401 pide una renovación y repite la petición una sola vez, con el token nuevo.
  // Si no hay renovación o el reintento falla con 401, se lanza el error original.
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await enviar<T>(method, path, body)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || esRutaDeAuth(path)) {
        throw error
      }
      if (!(await unauthorizedHandler())) {
        throw error
      }
      try {
        return await enviar<T>(method, path, body)
      } catch (reintento) {
        throw reintento instanceof ApiError && reintento.status === 401 ? error : reintento
      }
    }
  }

  async function enviar<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-Id': crypto.randomUUID(),
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const token = tokenProvider()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIEMPO_LIMITE_MS)
    try {
      let response: Response
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })
      } catch {
        throw controller.signal.aborted
          ? new ApiError(0, 'TIEMPO_AGOTADO')
          : new ApiError(0, 'RED_NO_DISPONIBLE')
      }

      if (!response.ok) {
        throw new ApiError(response.status, await codigoDeError(response))
      }
      if (response.status === 204) {
        return undefined as T
      }
      return (await response.json()) as T
    } catch (error) {
      // El tiempo límite también cubre la lectura del cuerpo.
      if (!(error instanceof ApiError) && controller.signal.aborted) {
        throw new ApiError(0, 'TIEMPO_AGOTADO')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  }
}

export const apiClient = createHttpClient('/api/v1')

// /health vive fuera de /api/v1.
export const rootClient = createHttpClient('')
