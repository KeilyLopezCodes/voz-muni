import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'

type Renovador = typeof import('../../src/features/auth/sesion/renovador')

const fetchMock = vi.fn<typeof fetch>()

// Cada import tras resetModules es otra "pestaña": su propio estado de módulo,
// pero el mismo localStorage y el mismo navigator.locks.
async function nuevaPestana(): Promise<Renovador> {
  vi.resetModules()
  return import('../../src/features/auth/sesion/renovador')
}

function respuestaSesion(refreshToken: string) {
  return {
    accessToken: `acceso-${refreshToken}`,
    accessExpiraEn: '2026-10-23T15:15:00.000Z',
    refreshToken,
    refreshExpiraEn: '2026-10-30T15:00:00.000Z',
    usuario: { id: 1, nombre: 'Vecino', rol: 'vecino', dependenciaId: null },
  }
}

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

// El backend falso rota el token: 't1' → 't1+'. Un token ya rotado responde 401, como en SPEC 08.
function backendQueRota() {
  const rotados = new Set<string>()
  fetchMock.mockImplementation(async (_url, init) => {
    const { refreshToken } = JSON.parse(init?.body as string) as { refreshToken: string }
    if (rotados.has(refreshToken)) {
      return json(401, { codigo: 'SESION_INVALIDA', mensaje: 'reuso' })
    }
    rotados.add(refreshToken)
    return json(200, respuestaSesion(`${refreshToken}+`))
  })
}

const tokensEnviados = () =>
  fetchMock.mock.calls.map(([, init]) => (JSON.parse(init?.body as string) as { refreshToken: string }).refreshToken)

// navigator.locks falso: atiende las peticiones de una en una, en orden de llegada.
// antesDeEntrar corre justo al obtener el lock, antes del callback.
function instalarLocks(antesDeEntrar?: () => void) {
  let cola: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_nombre: string, callback: () => Promise<unknown>) => {
    const turno = cola.then(() => {
      antesDeEntrar?.()
      return callback()
    })
    cola = turno.catch(() => undefined)
    return turno
  })
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  return request
}

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  delete (navigator as { locks?: unknown }).locks
  vi.unstubAllGlobals()
})

describe('renovador', () => {
  it('sin token guardado devuelve null sin llamar a la API', async () => {
    const { renovar } = await nuevaPestana()

    await expect(renovar()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con 200 guarda el refreshToken nuevo y devuelve la respuesta', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    backendQueRota()
    const { renovar } = await nuevaPestana()

    const respuesta = await renovar()

    expect(respuesta).toMatchObject({ accessToken: 'acceso-t1+', refreshToken: 't1+' })
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('t1+')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('un 401 borra el token y devuelve null', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    fetchMock.mockResolvedValue(json(401, { codigo: 'SESION_INVALIDA', mensaje: 'x' }))
    const { renovar } = await nuevaPestana()

    await expect(renovar()).resolves.toBeNull()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('un error de red se propaga y conserva el token', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { renovar } = await nuevaPestana()

    await expect(renovar()).rejects.toMatchObject({ codigo: 'RED_NO_DISPONIBLE' })
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('t1')
  })

  describe('sin navigator.locks', () => {
    it('dos llamadas simultáneas hacen una sola petición y reciben la misma respuesta', async () => {
      localStorage.setItem(CLAVE_REFRESH, 't1')
      backendQueRota()
      const { renovar } = await nuevaPestana()

      const [a, b, c] = await Promise.all([renovar(), renovar(), renovar()])

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(a).toBe(b)
      expect(b).toBe(c)
    })

    it('terminada una renovación, la siguiente hace una petición nueva con el token rotado', async () => {
      localStorage.setItem(CLAVE_REFRESH, 't1')
      backendQueRota()
      const { renovar } = await nuevaPestana()

      await renovar()
      await renovar()

      expect(tokensEnviados()).toEqual(['t1', 't1+'])
    })
  })

  describe('con navigator.locks', () => {
    it('usa el lock vozmuni-refresh y una sola petición por pestaña', async () => {
      localStorage.setItem(CLAVE_REFRESH, 't1')
      backendQueRota()
      const request = instalarLocks()
      const { renovar, NOMBRE_LOCK } = await nuevaPestana()

      await Promise.all([renovar(), renovar()])

      expect(NOMBRE_LOCK).toBe('vozmuni-refresh')
      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0][0]).toBe('vozmuni-refresh')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('si el token cambió al obtener el lock, no llama a /auth/refresh con el viejo', async () => {
      localStorage.setItem(CLAVE_REFRESH, 'viejo')
      backendQueRota()
      // Mientras esperaba el lock, otra pestaña renovó y guardó su token.
      instalarLocks(() => localStorage.setItem(CLAVE_REFRESH, 'de-otra-pestaña'))
      const { renovar } = await nuevaPestana()

      await expect(renovar()).resolves.toMatchObject({ refreshToken: 'de-otra-pestaña+' })
      expect(tokensEnviados()).toEqual(['de-otra-pestaña'])
    })

    it('dos pestañas que renuevan a la vez no presentan el mismo token y ninguna recibe 401', async () => {
      localStorage.setItem(CLAVE_REFRESH, 't1')
      backendQueRota()
      instalarLocks()
      const pestanaA = await nuevaPestana()
      const pestanaB = await nuevaPestana()

      const [a, b] = await Promise.all([pestanaA.renovar(), pestanaB.renovar()])

      expect(tokensEnviados()).toEqual(['t1', 't1+'])
      expect(a?.refreshToken).toBe('t1+')
      expect(b?.refreshToken).toBe('t1++')
      expect(localStorage.getItem(CLAVE_REFRESH)).toBe('t1++')
    })

    it('si otra pestaña cerró sesión mientras esperaba el lock, devuelve null sin llamar a la API', async () => {
      localStorage.setItem(CLAVE_REFRESH, 't1')
      backendQueRota()
      instalarLocks(() => localStorage.removeItem(CLAVE_REFRESH))
      const { renovar } = await nuevaPestana()

      await expect(renovar()).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
