import { ApiError, type DetalleError, type RegistroError } from './api-error'

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
  // multipart/form-data: el navegador pone el Content-Type con su boundary (SPEC 24).
  postForm<T>(path: string, form: FormData): Promise<T>
  // El cuerpo como Blob, con el token y la renovación de siempre: para descargar archivos (SPEC 24).
  descargar(path: string): Promise<Blob>
}

// JSON por defecto; FormData para subir archivos.
type Cuerpo = { json: unknown } | { form: FormData }
type Lectura = 'json' | 'blob'

const esDetalle = (valor: unknown): valor is DetalleError =>
  typeof valor === 'object' &&
  valor !== null &&
  typeof (valor as DetalleError).campo === 'string' &&
  typeof (valor as DetalleError).problema === 'string'

const esRegistro = (valor: unknown): valor is RegistroError =>
  typeof valor === 'object' &&
  valor !== null &&
  typeof (valor as RegistroError).id === 'number' &&
  typeof (valor as RegistroError).nombre === 'string'

// Cuerpo de error del backend: { "codigo": "...", "mensaje": "...", "detalles"?: [{ campo, problema } | { id, nombre }] }.
async function errorDeRespuesta(response: Response): Promise<ApiError> {
  try {
    const cuerpo: unknown = await response.json()
    if (cuerpo && typeof cuerpo === 'object' && 'codigo' in cuerpo && typeof cuerpo.codigo === 'string') {
      const lista: unknown[] = 'detalles' in cuerpo && Array.isArray(cuerpo.detalles) ? cuerpo.detalles : []
      return new ApiError(response.status, cuerpo.codigo, lista.filter(esDetalle), lista.filter(esRegistro))
    }
  } catch {
    // Cuerpo vacío o no JSON: se usa el código genérico.
  }
  return new ApiError(response.status, `HTTP_${response.status}`)
}

export function createHttpClient(baseUrl: string): HttpClient {
  // Ante un 401 pide una renovación y repite la petición una sola vez, con el token nuevo.
  // Si no hay renovación o el reintento falla con 401, se lanza el error original.
  async function request<T>(method: string, path: string, cuerpo?: Cuerpo, lectura: Lectura = 'json'): Promise<T> {
    try {
      return await enviar<T>(method, path, cuerpo, lectura)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || esRutaDeAuth(path)) {
        throw error
      }
      if (!(await unauthorizedHandler())) {
        throw error
      }
      try {
        return await enviar<T>(method, path, cuerpo, lectura)
      } catch (reintento) {
        throw reintento instanceof ApiError && reintento.status === 401 ? error : reintento
      }
    }
  }

  async function enviar<T>(method: string, path: string, cuerpo: Cuerpo | undefined, lectura: Lectura): Promise<T> {
    const headers: Record<string, string> = {
      Accept: lectura === 'json' ? 'application/json' : '*/*',
      'X-Request-Id': crypto.randomUUID(),
    }
    if (cuerpo && 'json' in cuerpo) {
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
          body: cuerpo === undefined ? undefined : 'json' in cuerpo ? JSON.stringify(cuerpo.json) : cuerpo.form,
          signal: controller.signal,
        })
      } catch {
        throw controller.signal.aborted
          ? new ApiError(0, 'TIEMPO_AGOTADO')
          : new ApiError(0, 'RED_NO_DISPONIBLE')
      }

      if (!response.ok) {
        throw await errorDeRespuesta(response)
      }
      if (response.status === 204) {
        return undefined as T
      }
      return (lectura === 'blob' ? await response.blob() : await response.json()) as T
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
    post: (path, body) => request('POST', path, { json: body }),
    put: (path, body) => request('PUT', path, { json: body }),
    patch: (path, body) => request('PATCH', path, { json: body }),
    delete: (path) => request('DELETE', path),
    postForm: (path, form) => request('POST', path, { form }),
    descargar: (path) => request<Blob>('GET', path, undefined, 'blob'),
  }
}

export const apiClient = createHttpClient('/api/v1')

// /health vive fuera de /api/v1.
export const rootClient = createHttpClient('')
