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
// `tituloPorRol` cubre las páginas que cambian según el rol: el vecino ve "Mis quejas" en /tickets (SPEC 25).
const ACCESO: Record<string, { roles: readonly Rol[]; titulo: string; tituloPorRol?: Partial<Record<Rol, string>> }> = {
  '/tickets': { roles: ROLES, titulo: tickets.listado.titulo, tituloPorRol: { vecino: tickets.misQuejas.titulo } },
  '/tickets/nueva': { roles: ['vecino', 'receptor', 'supervisor'], titulo: tickets.nuevo.titulo },
  '/triage': { roles: ['supervisor'], titulo: tickets.triage.titulo },
  '/asignacion': { roles: ['coordinador', 'supervisor'], titulo: tickets.asignacion.titulo },
  '/traslados': { roles: ['supervisor'], titulo: tickets.traslados.titulo },
  '/escaladas': { roles: ['supervisor'], titulo: tickets.escaladas.titulo },
  '/atencion': { roles: ['tecnico', 'coordinador', 'supervisor'], titulo: tickets.atencion.titulo },
  '/reportes': {
    roles: ['tecnico', 'coordinador', 'supervisor', 'administrador'],
    titulo: reportes.titulo,
  },
  '/admin': { roles: ['administrador'], titulo: admin.titulo },
  '/admin/sla': { roles: ['administrador'], titulo: admin.sla.titulo },
  '/admin/dependencias': { roles: ['administrador'], titulo: admin.catalogos.dependencias.titulo },
  '/admin/categorias': { roles: ['administrador'], titulo: admin.catalogos.categorias.titulo },
  '/admin/zonas': { roles: ['administrador'], titulo: admin.catalogos.zonas.titulo },
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
      <SessionProvider session={rol ? { usuarioId: 1, nombre: 'Usuario Prueba', rol, dependenciaId: null } : null}>
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
      const { roles, titulo, tituloPorRol } = ACCESO[path]

      if (roles.includes(rol)) {
        expect(router.state.location.pathname).toBe(path)
        expect(tituloActual()).toBe(tituloPorRol?.[rol] ?? titulo)
      } else {
        expect(router.state.location.pathname).toBe('/403')
        expect(tituloActual()).toBe(comun.errores.noAutorizado.titulo)
      }
    })
  })

  it.each(ROLES)('/tickets/:id abre el detalle con el rol %s (SPEC 25)', async (rol) => {
    const router = renderRuta('/tickets/15', rol)
    expect(router.state.location.pathname).toBe('/tickets/15')
    expect(await screen.findByRole('link', { name: tickets.detalle.volver })).toHaveAttribute('href', '/tickets')
  })

  it('/tickets/nueva no la toma /tickets/:id', () => {
    renderRuta('/tickets/nueva', 'vecino')
    expect(tituloActual()).toBe(tickets.nuevo.titulo)
  })

  it('sin sesión, /tickets/:id redirige a /login', () => {
    const router = renderRuta('/tickets/15', null)
    expect(router.state.location.pathname).toBe('/login')
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
    // Desde SPEC 44 es una pantalla pública: h1 "VozMuni" y el título de la página en h2.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(tickets.consulta.titulo)
  })

  it('/registro carga sin sesión (SPEC 16)', () => {
    const router = renderRuta('/registro', null)
    expect(router.state.location.pathname).toBe('/registro')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(auth.registro.titulo)
  })

  it('/verificar carga sin sesión (SPEC 16)', () => {
    const router = renderRuta('/verificar', null)
    expect(router.state.location.pathname).toBe('/verificar')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(auth.verificar.titulo)
  })

  it('/recuperar carga sin sesión (SPEC 17)', () => {
    const router = renderRuta('/recuperar', null)
    expect(router.state.location.pathname).toBe('/recuperar')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(auth.recuperar.titulo)
  })

  it('/restablecer carga sin sesión (SPEC 17)', () => {
    const router = renderRuta('/restablecer?token=abc', null)
    expect(router.state.location.pathname).toBe('/restablecer')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(auth.restablecer.titulo)
  })

  it('una ruta inexistente muestra la página 404', () => {
    renderRuta('/no-existe', null)
    expect(tituloActual()).toBe(comun.errores.noEncontrado.titulo)
  })
})
