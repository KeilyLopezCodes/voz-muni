import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'
import comun from '../../src/locales/es/comun.json'
import { ApiError } from '../../src/shared/api/api-error'
import { apiClient } from '../../src/shared/api/http-client'
import { RequireRole } from '../../src/shared/auth/RequireRole'
import { useSession } from '../../src/shared/auth/session'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function sesion(refreshToken: string, rol = 'vecino') {
  return {
    accessToken: `acceso-${refreshToken}`,
    accessExpiraEn: '2026-10-23T15:15:00.000Z',
    refreshToken,
    refreshExpiraEn: '2026-10-30T15:00:00.000Z',
    usuario: { id: 5, nombre: 'Vecino', rol, dependenciaId: null },
  }
}

// /auth/refresh rota el token ('t1' → 't1+'); las demás rutas las decide cada prueba.
function backend(otras: (url: string, init?: RequestInit) => Response | Promise<Response> = () => json(404, {})) {
  fetchMock.mockImplementation(async (entrada, init) => {
    const url = String(entrada)
    if (url === '/api/v1/auth/refresh') {
      const { refreshToken } = JSON.parse(init?.body as string) as { refreshToken: string }
      return json(200, sesion(`${refreshToken}+`))
    }
    return otras(url, init)
  })
}

const llamadasA = (ruta: string) => fetchMock.mock.calls.filter(([url]) => url === ruta)

function Privada() {
  const [resultado, setResultado] = useState('')
  const pedir = () =>
    apiClient
      .get<{ id: number }>('/tickets')
      .then((r) => setResultado(`ok-${r.id}`))
      .catch((e: ApiError) => setResultado(`error-${e.codigo}`))
  return (
    <>
      <p>contenido-privado</p>
      <button onClick={pedir}>pedir</button>
      <p>{resultado}</p>
    </>
  )
}

function Login() {
  const location = useLocation()
  return <p>pantalla-login {(location.state as { desde?: string } | null)?.desde}</p>
}

function VerSesion() {
  const session = useSession()
  return <p>sesion-{session ? `${session.usuarioId}-${session.rol}` : 'ninguna'}</p>
}

function montar(inicio = '/privada') {
  const irALogin = vi.fn()
  const queryClient = new QueryClient()
  queryClient.setQueryData(['dato'], 'en-cache')
  const router = createMemoryRouter(
    [
      { path: '/login', element: <Login /> },
      {
        path: '/privada',
        element: (
          <RequireRole roles={['vecino']}>
            <Privada />
          </RequireRole>
        ),
      },
    ],
    { initialEntries: [inicio] },
  )
  render(
    <AuthProvider queryClient={queryClient} irALogin={irALogin}>
      <VerSesion />
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return { irALogin, queryClient, router }
}

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('con un token guardado recupera la sesión, y mientras tanto RequireRole no redirige', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    let responder: (r: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((resolver) => (responder = resolver)))

    montar()

    expect(screen.getByRole('progressbar', { name: comun.sesion.cargando })).toBeInTheDocument()
    expect(screen.queryByText(/pantalla-login/)).not.toBeInTheDocument()

    await act(async () => responder(json(200, sesion('t1+'))))

    expect(await screen.findByText('contenido-privado')).toBeInTheDocument()
    expect(screen.getByText('sesion-5-vecino')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('t1+')
  })

  it('el token de acceso no se guarda en localStorage, sessionStorage ni cookies', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    backend()

    montar()
    await screen.findByText('contenido-privado')

    const todo = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie
    expect(todo).not.toContain('acceso-')
  })

  it('sin token la sesión queda null sin llamar a la API, y /login recibe la ruta original', async () => {
    montar('/privada?pagina=2')

    expect(await screen.findByText('pantalla-login /privada?pagina=2')).toBeInTheDocument()
    expect(screen.getByText('sesion-ninguna')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un rol desconocido se descarta: no hay sesión y se borra el token', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    fetchMock.mockResolvedValue(json(200, sesion('t1+', 'superusuario')))

    montar()

    expect(await screen.findByText(/pantalla-login/)).toBeInTheDocument()
    expect(screen.getByText('sesion-ninguna')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('el evento storage con null (logout en otra pestaña) cierra la sesión, limpia la caché y va a /login', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    backend()
    const { irALogin, queryClient } = montar()
    await screen.findByText('contenido-privado')

    localStorage.removeItem(CLAVE_REFRESH)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_REFRESH, oldValue: 't1+', newValue: null }))
    })

    expect(await screen.findByText(/pantalla-login/)).toBeInTheDocument()
    expect(screen.getByText('sesion-ninguna')).toBeInTheDocument()
    expect(irALogin).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(['dato'])).toBeUndefined()
  })

  it('el evento storage con un token nuevo (login en otra pestaña) recupera la sesión', async () => {
    backend()
    montar('/login')
    expect(screen.getByText('sesion-ninguna')).toBeInTheDocument()

    localStorage.setItem(CLAVE_REFRESH, 'de-otra-pestaña')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_REFRESH, oldValue: null, newValue: 'de-otra-pestaña' }))
    })

    expect(await screen.findByText('sesion-5-vecino')).toBeInTheDocument()
    expect(llamadasA('/api/v1/auth/refresh')).toHaveLength(1)
  })

  it('un evento storage de otra clave no hace nada', async () => {
    backend()
    montar('/login')

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'otra-cosa', newValue: 'x' }))
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un 401 de la API renueva y reintenta con el token nuevo', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    let primera = true
    backend(() => {
      if (primera) {
        primera = false
        return json(401, { codigo: 'TOKEN_INVALIDO', mensaje: 'vencido' })
      }
      return json(200, { id: 7 })
    })
    montar()
    await screen.findByText('contenido-privado')

    fireEvent.click(screen.getByRole('button', { name: 'pedir' }))

    expect(await screen.findByText('ok-7')).toBeInTheDocument()
    const tickets = llamadasA('/api/v1/tickets')
    expect(tickets).toHaveLength(2)
    expect(new Headers(tickets[0][1]?.headers).get('Authorization')).toBe('Bearer acceso-t1+')
    expect(new Headers(tickets[1][1]?.headers).get('Authorization')).toBe('Bearer acceso-t1++')
    expect(llamadasA('/api/v1/auth/refresh')).toHaveLength(2)
  })

  it('varios 401 a la vez generan una sola renovación', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    backend((_url, init) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer acceso-t1+'
        ? json(401, { codigo: 'TOKEN_INVALIDO', mensaje: 'vencido' })
        : json(200, { id: 1 }),
    )
    montar()
    await screen.findByText('contenido-privado')

    await act(() => Promise.all([apiClient.get('/tickets'), apiClient.get('/tickets'), apiClient.get('/tickets')]))

    // Una al cargar y una sola por los tres 401.
    expect(llamadasA('/api/v1/auth/refresh')).toHaveLength(2)
  })

  it('si la renovación falla, se cierra la sesión y se va a /login', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    let refrescos = 0
    fetchMock.mockImplementation(async (entrada) => {
      if (String(entrada) === '/api/v1/auth/refresh') {
        refrescos++
        return refrescos === 1 ? json(200, sesion('t1+')) : json(401, { codigo: 'SESION_INVALIDA', mensaje: 'x' })
      }
      return json(401, { codigo: 'TOKEN_INVALIDO', mensaje: 'vencido' })
    })
    montar()
    await screen.findByText('contenido-privado')

    fireEvent.click(screen.getByRole('button', { name: 'pedir' }))

    expect(await screen.findByText(/pantalla-login/)).toBeInTheDocument()
    expect(screen.getByText('sesion-ninguna')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('sin red al cargar no hay sesión, pero el token se conserva', async () => {
    localStorage.setItem(CLAVE_REFRESH, 't1')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    montar()

    expect(await screen.findByText(/pantalla-login/)).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('t1')
  })
})
