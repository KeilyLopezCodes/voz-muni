import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { LoginPage } from '../../src/features/auth/pages/LoginPage'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'
import auth from '../../src/locales/es/auth.json'
import '../../src/shared/i18n/i18n'

const fetchMock = vi.fn<typeof fetch>()
const { login } = auth

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function sesion(rol: string) {
  return {
    accessToken: 'acceso-1',
    accessExpiraEn: '2026-10-23T15:15:00.000Z',
    refreshToken: 'r1',
    refreshExpiraEn: '2026-10-30T15:00:00.000Z',
    usuario: { id: 3, nombre: 'Usuario', rol, dependenciaId: null },
  }
}

const HEALTH_OK = { status: 'ok', database: 'up', timestamp: '2026-10-22T15:04:05.000Z' }

// /health responde según la prueba; /auth/login y /auth/refresh con lo que se indique.
function backend({
  health = async () => json(200, HEALTH_OK),
  loginResp = async () => json(200, sesion('vecino')),
  refresh = async () => json(401, { codigo: 'SESION_INVALIDA' }),
}: {
  health?: () => Promise<Response>
  loginResp?: () => Promise<Response>
  refresh?: () => Promise<Response>
} = {}) {
  fetchMock.mockImplementation(async (entrada) => {
    const url = String(entrada)
    if (url === '/health') return health()
    if (url === '/api/v1/auth/login') return loginResp()
    if (url === '/api/v1/auth/refresh') return refresh()
    return json(404, {})
  })
}

function renderLogin(entrada: InitialEntry = '/login') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/tickets', element: <p>pantalla-tickets</p> },
      { path: '/tickets/nueva', element: <p>pantalla-nueva</p> },
      { path: '/admin', element: <p>pantalla-admin</p> },
      { path: '/registro', element: <p>pantalla-registro</p> },
    ],
    { initialEntries: [entrada] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider queryClient={queryClient} irALogin={() => void router.navigate('/login')}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}

function llenar(email = 'vecino@vozmuni.test', password = 'Desarrollo2026') {
  fireEvent.change(screen.getByLabelText(login.campos.email, { exact: false }), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(login.campos.password, { exact: false }), { target: { value: password } })
}

const enviar = () => fireEvent.click(screen.getByRole('button', { name: login.enviar }))
const llamadasLogin = () => fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/login')

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginPage: indicador del servidor (SPEC 06)', () => {
  it('muestra "Servidor disponible" cuando /health responde 200', async () => {
    backend()
    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.disponible)).toBeInTheDocument()
  })

  it('muestra "Servidor no disponible" cuando /health responde 503', async () => {
    backend({ health: async () => json(503, { status: 'degraded', database: 'down', timestamp: 'x' }) })
    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.noDisponible)).toBeInTheDocument()
  })

  it('muestra "Servidor no disponible" cuando el backend no responde', async () => {
    backend({
      health: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderLogin()

    expect(await screen.findByText(auth.estadoServidor.noDisponible)).toBeInTheDocument()
  })
})

describe('LoginPage: formulario (SPEC 17)', () => {
  it('tiene etiquetas, autocomplete y los enlaces a /recuperar y /registro', () => {
    backend()
    renderLogin()

    expect(screen.getByLabelText(login.campos.email, { exact: false })).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(login.campos.password, { exact: false })).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    expect(screen.getByRole('link', { name: login.olvide })).toHaveAttribute('href', '/recuperar')
    expect(screen.getByRole('link', { name: login.crearCuenta })).toHaveAttribute('href', '/registro')
  })

  it('un login correcto de un vecino guarda el refresh y va a /tickets', async () => {
    backend()
    const router = renderLogin()

    llenar(' vecino@vozmuni.test ')
    enviar()

    expect(await screen.findByText('pantalla-tickets')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
    expect(localStorage.getItem(CLAVE_REFRESH)).toBe('r1')
    expect(JSON.parse(llamadasLogin()[0][1]?.body as string)).toEqual({
      email: 'vecino@vozmuni.test',
      password: 'Desarrollo2026',
    })
  })

  it('un administrador va a /admin', async () => {
    backend({ loginResp: async () => json(200, sesion('administrador')) })
    renderLogin()

    llenar('administrador@vozmuni.test')
    enviar()

    expect(await screen.findByText('pantalla-admin')).toBeInTheDocument()
  })

  it('con state.desde = /tickets/nueva el vecino vuelve ahí', async () => {
    backend()
    renderLogin({ pathname: '/login', state: { desde: '/tickets/nueva' } })

    llenar()
    enviar()

    expect(await screen.findByText('pantalla-nueva')).toBeInTheDocument()
  })

  it.each(['//evil.com', 'https://evil.com', '/admin'])('con state.desde = %s el vecino va a su inicio', async (desde) => {
    backend()
    renderLogin({ pathname: '/login', state: { desde } })

    llenar()
    enviar()

    expect(await screen.findByText('pantalla-tickets')).toBeInTheDocument()
  })

  it.each([
    ['CREDENCIALES_INVALIDAS', async () => json(401, { codigo: 'CREDENCIALES_INVALIDAS' }), login.errores.CREDENCIALES_INVALIDAS],
    ['CUENTA_BLOQUEADA', async () => json(423, { codigo: 'CUENTA_BLOQUEADA' }), login.errores.CUENTA_BLOQUEADA],
    ['CORREO_NO_VERIFICADO', async () => json(403, { codigo: 'CORREO_NO_VERIFICADO' }), login.errores.CORREO_NO_VERIFICADO],
    ['DEMASIADAS_PETICIONES', async () => json(429, { codigo: 'DEMASIADAS_PETICIONES' }), login.errores.DEMASIADAS_PETICIONES],
    [
      'RED_NO_DISPONIBLE',
      async () => {
        throw new TypeError('Failed to fetch')
      },
      login.errores.RED_NO_DISPONIBLE,
    ],
    ['un código desconocido', async () => json(500, { codigo: 'ALGO_RARO' }), login.errores.GENERICO],
  ])('%s muestra su mensaje en un role="alert"', async (_codigo, loginResp, mensaje) => {
    backend({ loginResp })
    renderLogin()

    llenar()
    enviar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(mensaje)
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('CORREO_NO_VERIFICADO muestra un enlace a /registro', async () => {
    backend({ loginResp: async () => json(403, { codigo: 'CORREO_NO_VERIFICADO' }) })
    renderLogin()

    llenar()
    enviar()

    expect(await screen.findByRole('link', { name: login.irARegistro })).toHaveAttribute('href', '/registro')
  })

  it('un rol desconocido no crea sesión y muestra el error genérico', async () => {
    backend({ loginResp: async () => json(200, sesion('superusuario')) })
    renderLogin()

    llenar()
    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(login.errores.GENERICO)
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })

  it('valida en el cliente: correo inválido y contraseña vacía no llaman a la API, y el foco va al primer error', async () => {
    backend()
    renderLogin()

    llenar('no-es-correo', '')
    enviar()

    expect(await screen.findByText(login.validacion.EMAIL_INVALIDO)).toBeInTheDocument()
    expect(screen.getByText(login.validacion.PASSWORD_REQUERIDA)).toBeInTheDocument()
    // Los errores de campo también se anuncian a lectores de pantalla.
    const alertas = screen.getAllByRole('alert').map((alerta) => alerta.textContent)
    expect(alertas).toEqual(expect.arrayContaining([login.validacion.EMAIL_INVALIDO, login.validacion.PASSWORD_REQUERIDA]))
    expect(screen.getByLabelText(login.campos.email, { exact: false })).toHaveFocus()
    expect(llamadasLogin()).toHaveLength(0)
  })

  it('el botón se deshabilita mientras envía', async () => {
    let responder: (r: Response) => void = () => {}
    backend({ loginResp: () => new Promise<Response>((resolver) => (responder = resolver)) })
    renderLogin()

    llenar()
    enviar()

    await waitFor(() => expect(screen.getByRole('button', { name: login.enviando })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: login.enviando }))
    expect(llamadasLogin()).toHaveLength(1)

    await act(async () => responder(json(401, { codigo: 'CREDENCIALES_INVALIDAS' })))
    expect(await screen.findByRole('button', { name: login.enviar })).toBeEnabled()
  })

  it('con sesión, /login redirige al inicio del rol', async () => {
    localStorage.setItem(CLAVE_REFRESH, 'guardado')
    backend({ refresh: async () => json(200, sesion('vecino')) })
    const router = renderLogin()

    expect(await screen.findByText('pantalla-tickets')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets')
  })
})
