import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/shared/api/api-error'
import { apiClient, rootClient, setTokenProvider } from '../../src/shared/api/http-client'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function headersDeLlamada(index = 0): Headers {
  return new Headers(fetchMock.mock.calls[index][1]?.headers)
}

async function capturarError(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('se esperaba un ApiError')
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setTokenProvider(() => null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('http-client', () => {
  it('apiClient antepone /api/v1 y rootClient usa la raíz', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))

    await apiClient.get('/tickets')
    await rootClient.get('/health')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/tickets')
    expect(fetchMock.mock.calls[1][0]).toBe('/health')
  })

  it('devuelve el JSON parseado en una respuesta 2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 7 }))

    await expect(apiClient.get('/tickets/7')).resolves.toEqual({ id: 7 })
  })

  it('envía un X-Request-Id distinto en cada petición', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))

    await apiClient.get('/tickets')
    await apiClient.get('/tickets')

    const primero = headersDeLlamada(0).get('X-Request-Id')
    const segundo = headersDeLlamada(1).get('X-Request-Id')
    expect(primero).toMatch(/^[0-9a-f-]{36}$/)
    expect(segundo).toMatch(/^[0-9a-f-]{36}$/)
    expect(primero).not.toBe(segundo)
  })

  it('envía Content-Type y el cuerpo en JSON solo cuando hay cuerpo', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))

    await apiClient.post('/tickets', { titulo: 'x' })
    await apiClient.get('/tickets')

    expect(headersDeLlamada(0).get('Content-Type')).toBe('application/json')
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"titulo":"x"}')
    expect(headersDeLlamada(1).get('Content-Type')).toBeNull()
    expect(headersDeLlamada(1).get('Accept')).toBe('application/json')
  })

  it('envía Authorization solo cuando el proveedor devuelve un token', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}))

    await apiClient.get('/tickets')
    setTokenProvider(() => 'abc123')
    await apiClient.get('/tickets')

    expect(headersDeLlamada(0).get('Authorization')).toBeNull()
    expect(headersDeLlamada(1).get('Authorization')).toBe('Bearer abc123')
  })

  it('devuelve undefined en una respuesta 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(apiClient.delete('/tickets/7')).resolves.toBeUndefined()
  })

  it('lanza ApiError con el codigo del cuerpo en un 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { codigo: 'TICKET_NO_ENCONTRADO', mensaje: 'No existe' }))

    const error = await capturarError(apiClient.get('/tickets/99'))
    expect(error.status).toBe(404)
    expect(error.codigo).toBe('TICKET_NO_ENCONTRADO')
  })

  it('lanza ApiError con HTTP_500 cuando el cuerpo no trae codigo', async () => {
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    const error = await capturarError(apiClient.get('/tickets'))
    expect(error.status).toBe(500)
    expect(error.codigo).toBe('HTTP_500')
  })

  it('lanza ApiError con status 0 y RED_NO_DISPONIBLE ante un error de red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await capturarError(apiClient.get('/tickets'))
    expect(error.status).toBe(0)
    expect(error.codigo).toBe('RED_NO_DISPONIBLE')
  })

  it('lanza ApiError con status 0 y TIEMPO_AGOTADO a los 15 s', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    const promesa = capturarError(apiClient.get('/tickets'))
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = await promesa
    expect(error.status).toBe(0)
    expect(error.codigo).toBe('TIEMPO_AGOTADO')
  })
})
