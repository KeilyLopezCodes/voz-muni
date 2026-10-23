import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rutasApp } from '../../src/app/router'
import admin from '../../src/locales/es/admin.json'
import auth from '../../src/locales/es/auth.json'
import comun from '../../src/locales/es/comun.json'
import reportes from '../../src/locales/es/reportes.json'
import tickets from '../../src/locales/es/tickets.json'
import { ROLES, type Rol } from '../../src/shared/auth/roles'
import { SessionProvider } from '../../src/shared/auth/SessionProvider'
import '../../src/shared/i18n/i18n'

// Tabla de rutas de SPEC 06, escrita aparte de rutas.ts para detectar si divergen.
const ACCESO: Record<string, { roles: readonly Rol[]; titulo: string }> = {
  '/tickets': { roles: ROLES, titulo: tickets.listado.titulo },
  '/tickets/nueva': { roles: ['vecino', 'receptor', 'supervisor'], titulo: tickets.nuevo.titulo },
  '/reportes': {
    roles: ['tecnico', 'coordinador', 'supervisor', 'administrador'],
    titulo: reportes.titulo,
  },
  '/admin': { roles: ['administrador'], titulo: admin.titulo },
}

// /login consulta /health; las pruebas del router no dependen de su respuesta.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderRuta(path: string, rol: Rol | null) {
  const router = createMemoryRouter(rutasApp, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={rol ? { usuarioId: 1, rol, dependenciaId: null } : null}>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return router
}

function tituloActual(): string | null {
  return screen.getByRole('heading', { level: 1 }).textContent
}

describe('router', () => {
  describe.each(ROLES)('rol %s', (rol) => {
    it.each(Object.keys(ACCESO))('%s según la tabla de rutas', (path) => {
      const router = renderRuta(path, rol)
      const { roles, titulo } = ACCESO[path]

      if (roles.includes(rol)) {
        expect(router.state.location.pathname).toBe(path)
        expect(tituloActual()).toBe(titulo)
      } else {
        expect(router.state.location.pathname).toBe('/403')
        expect(tituloActual()).toBe(comun.errores.noAutorizado.titulo)
      }
    })
  })

  it('/ redirige a /admin con el rol administrador', () => {
    const router = renderRuta('/', 'administrador')
    expect(router.state.location.pathname).toBe('/admin')
  })

  it.each(ROLES.filter((rol) => rol !== 'administrador'))('/ redirige a /tickets con el rol %s', (rol) => {
    const router = renderRuta('/', rol)
    expect(router.state.location.pathname).toBe('/tickets')
  })

  it.each(['/', ...Object.keys(ACCESO)])('sin sesión, %s redirige a /login', (path) => {
    const router = renderRuta(path, null)
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(auth.login.titulo)
  })

  it('/consulta carga sin sesión', () => {
    const router = renderRuta('/consulta', null)
    expect(router.state.location.pathname).toBe('/consulta')
    expect(tituloActual()).toBe(tickets.consulta.titulo)
  })

  it.each([
    ['/registro', auth.registro.titulo],
    ['/verificar', auth.verificar.titulo],
  ])('%s carga sin sesión', (path, titulo) => {
    const router = renderRuta(path, null)
    expect(router.state.location.pathname).toBe(path)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(titulo)
  })

  it('una ruta inexistente muestra la página 404', () => {
    renderRuta('/no-existe', null)
    expect(tituloActual()).toBe(comun.errores.noEncontrado.titulo)
  })
})
