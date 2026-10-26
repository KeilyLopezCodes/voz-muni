import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { CLAVE_REFRESH } from '../../src/features/auth/sesion/almacen-sesion'
import comun from '../../src/locales/es/comun.json'
import { RequireRole } from '../../src/shared/auth/RequireRole'
import { ROLES, type Rol } from '../../src/shared/auth/roles'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import '../../src/shared/i18n/i18n'
import { RUTAS_PROTEGIDAS } from '../../src/shared/auth/rutas'
import { AppLayout, ICONO_POR_RUTA } from '../../src/shared/layout/AppLayout'

// La campana de notificaciones (SPEC 31) usa TanStack Query.
function ConConsultas({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  )
}

// Rutas con enMenu = true de la tabla de SPEC 06, por rol.
const MENU_ESPERADO: Record<Rol, string[]> = {
  vecino: ['/tickets', '/tickets/nueva'],
  receptor: ['/tickets', '/tickets/nueva'],
  tecnico: ['/tickets', '/atencion', '/reportes'],
  coordinador: ['/tickets', '/asignacion', '/atencion', '/reportes'],
  supervisor: ['/tickets', '/tickets/nueva', '/triage', '/asignacion', '/atencion', '/traslados', '/escaladas', '/reportes'],
  administrador: ['/tickets', '/reportes', '/admin'],
}

describe('AppLayout', () => {
  it.each(ROLES)('el menú del rol %s muestra exactamente sus rutas', (rol) => {
    render(
      <SessionProvider session={{ usuarioId: 1, nombre: 'Usuario Prueba', rol, dependenciaId: null }}>
        <MemoryRouter>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
      { wrapper: ConConsultas },
    )

    // El menú permanente está oculto con CSS en pantallas chicas, pero existe en el DOM.
    const menu = screen.getByRole('navigation', { name: comun.menu.principal, hidden: true })
    const enlaces = within(menu).getAllByRole('link', { hidden: true })
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(MENU_ESPERADO[rol])
  })

  it('cada ruta con enMenu tiene su icono (SPEC 44)', () => {
    const sinIcono = RUTAS_PROTEGIDAS.filter((ruta) => ruta.enMenu && !ICONO_POR_RUTA[ruta.path]).map((ruta) => ruta.path)
    expect(sinIcono).toEqual([])
  })

  it('el menú muestra el logo y marca la ruta actual con aria-current="page" (SPEC 44)', () => {
    render(
      <SessionProvider session={{ usuarioId: 1, nombre: 'Usuario Prueba', rol: 'supervisor', dependenciaId: null }}>
        <MemoryRouter initialEntries={['/triage']}>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
      { wrapper: ConConsultas },
    )

    const menu = screen.getByRole('navigation', { name: comun.menu.principal, hidden: true })
    expect(within(menu).getByRole('img', { name: comun.marca.logo, hidden: true })).toBeInTheDocument()
    const activos = within(menu)
      .getAllByRole('link', { hidden: true })
      .filter((enlace) => enlace.getAttribute('aria-current') === 'page')
    expect(activos.map((enlace) => enlace.getAttribute('href'))).toEqual(['/triage'])
    // /tickets no queda activo en /tickets/nueva ni en otras rutas: los enlaces usan "end".
    expect(within(menu).getByRole('link', { name: comun.menu.tickets, hidden: true })).not.toHaveAttribute('aria-current')
    // Cada ítem lleva su icono.
    for (const enlace of within(menu).getAllByRole('link', { hidden: true })) {
      expect(enlace.querySelector('svg')).not.toBeNull()
    }
  })

  it('sin sesión no muestra el menú de usuario ni "Cerrar sesión"', () => {
    render(
      <SessionProvider session={null}>
        <MemoryRouter>
          <AppLayout>
            <p>contenido</p>
          </AppLayout>
        </MemoryRouter>
      </SessionProvider>,
      { wrapper: ConConsultas },
    )

    expect(screen.queryByRole('button', { name: comun.menuUsuario.abrir })).not.toBeInTheDocument()
    expect(screen.queryByText(comun.menu.cerrarSesion)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Notificaciones/ })).not.toBeInTheDocument()
  })

  it('con sesión muestra la campana de notificaciones (SPEC 31)', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
    try {
      render(
        <SessionProvider session={{ usuarioId: 1, nombre: 'Usuario Prueba', rol: 'tecnico', dependenciaId: null }}>
          <MemoryRouter>
            <AppLayout>
              <p>contenido</p>
            </AppLayout>
          </MemoryRouter>
        </SessionProvider>,
        { wrapper: ConConsultas },
      )
      expect(screen.getByRole('button', { name: 'Notificaciones, 0 sin leer' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// Con AuthProvider real (SPEC 17): "Cerrar sesión" usa cerrarSesion() de la sesión del navegador.
// Desde SPEC 44 está dentro del menú de usuario: primero se abre el menú.
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
      <QueryClientProvider client={queryClient}>
        <AuthProvider queryClient={queryClient} irALogin={irALogin}>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    )
    return { queryClient, router, irALogin }
  }

  async function cerrarSesionDesdeMenu() {
    fireEvent.click(await screen.findByRole('button', { name: comun.menuUsuario.abrir }))
    fireEvent.click(screen.getByRole('menuitem', { name: comun.menu.cerrarSesion }))
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

    await cerrarSesionDesdeMenu()

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

    await cerrarSesionDesdeMenu()

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
    expect(queryClient.getQueryData(['quejas'])).toBeUndefined()
  })

  it('no espera la respuesta de /auth/logout para limpiar', async () => {
    backend(() => new Promise<Response>(() => {}))
    montar()

    await cerrarSesionDesdeMenu()

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE_REFRESH)).toBeNull()
  })
})
