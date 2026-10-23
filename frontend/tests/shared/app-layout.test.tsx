import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'
import comun from '../../src/locales/es/comun.json'
import { RequireRole } from '../../src/shared/auth/RequireRole'
import { ROLES, type Rol } from '../../src/shared/auth/roles'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import '../../src/shared/i18n/i18n'
import { AppLayout } from '../../src/shared/layout/AppLayout'

// Rutas con enMenu = true de la tabla de SPEC 06, por rol.
const MENU_ESPERADO: Record<Rol, string[]> = {
  vecino: ['/tickets', '/tickets/nueva'],
  receptor: ['/tickets', '/tickets/nueva'],
  tecnico: ['/tickets', '/reportes'],
  coordinador: ['/tickets', '/reportes'],
  supervisor: ['/tickets', '/tickets/nueva', '/reportes'],
  administrador: ['/tickets', '/reportes', '/admin'],
}

describe('AppLayout', () => {
  it.each(ROLES)('el menú del rol %s muestra exactamente sus rutas', (rol) => {
    render(
      <SessionProvider session={{ usuarioId: 1, rol, dependenciaId: null }}>
        <MemoryRouter>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
    )

    // El menú permanente está oculto con CSS en pantallas chicas, pero existe en el DOM.
    const menu = screen.getByRole('navigation', { name: comun.menu.principal, hidden: true })
    const enlaces = within(menu).getAllByRole('link', { hidden: true })
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(MENU_ESPERADO[rol])
  })

  it('sin sesión no muestra "Cerrar sesión"', () => {
    render(
      <SessionProvider session={null}>
        <MemoryRouter>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
    )

    expect(screen.queryByRole('button', { name: comun.menu.cerrarSesion })).not.toBeInTheDocument()
  })
})

// Con AuthProvider real (SPEC 17): el botón usa cerrarSesion() de la sesión del navegador.
describe('AppLayout: cerrar sesión', () => {
  const fetchMock = vi.fn<typeof fetch>()

  function json(status: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
  }

  function montar() {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['quejas'], ['en-cache'])
    const router = createMemoryRouter(
      [
        { path: '/login', element: <p>pantalla-login</p> },
        {
          path: '/tickets',
          element: (
            <RequireRole roles={ROLES}>
              <AppLayout>
                <p>contenido</p>
              </AppLayout>
            </RequireRole>
          ),
        },
      ],
      { initialEntries: ['/tickets'] },
    )
    const irALogin = vi.fn(() => void router.navigate('/login'))
    render(
      <AuthProvider queryClient={queryClient} irALogin={irALogin}>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    return { queryClient, router, irALogin }
  }

  // Al montar, AuthProvider renueva con el token guardado; luego la prueba decide /auth/logout.
  function backend(logout: () => Promise<Response>) {
    fetchMock.mockImplementation(async (entrada) => {
      if (String(entrada) === '/api/v1/auth/refresh') {
        return json(200, {
          accessToken: 'acceso-1',
          accessExpiraEn: '2026-10-23T15:15:00.000Z',
          refreshToken: 'r2',
          refreshExpiraEn: '2026-10-30T15:00:00.000Z',
          usuario: { id: 1, nombre: 'Vecino', rol: 'vecino', dependenciaId: null },
        })
      }
      return logout()
    })
  }

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(CLAVE_REFRESH, 'r1')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('llama a /auth/logout con el token, borra localStorage y la caché, y va a /login', async () => {
    backend(async () => new Response(null, { status: 204 }))
    const { queryClient, router, irALogin } = montar()

    fireEvent.click(await screen.findByRole('button', { name: comun.menu.cerrarSesion }))

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(irALogin).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
    expect(queryClient.getQueryData(['quejas'])).toBeUndefined()
    const logout = fetchMock.mock.calls.find(([url]) => url === '/api/v1/auth/logout')
    expect(logout?.[1]?.method).toBe('POST')
    expect(JSON.parse(logout?.[1]?.body as string)).toEqual({ refreshToken: 'r2' })
  })

  it('si /auth/logout falla por la red, igual limpia todo y va a /login', async () => {
    backend(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { queryClient } = montar()

    fireEvent.click(await screen.findByRole('button', { name: comun.menu.cerrarSesion }))

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
    expect(queryClient.getQueryData(['quejas'])).toBeUndefined()
  })

  it('no espera la respuesta de /auth/logout para limpiar', async () => {
    backend(() => new Promise<Response>(() => {}))
    montar()

    fireEvent.click(await screen.findByRole('button', { name: comun.menu.cerrarSesion }))

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })
})
