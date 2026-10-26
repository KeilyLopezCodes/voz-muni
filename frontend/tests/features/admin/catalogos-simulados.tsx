import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { CategoriaAdmin, DependenciaAdmin, ZonaAdmin } from '../../../src/features/admin/api/catalogos-admin-api'

// Datos y montaje comunes de las pruebas de las pantallas de catálogos (SPEC 40).

export const DEPENDENCIAS: DependenciaAdmin[] = [
  { id: 1, nombre: 'Dirección de Obras', activa: true, categoriasActivas: 2, usuariosActivos: 3, quejasAbiertas: 5 },
  { id: 2, nombre: 'Agua Potable', activa: true, categoriasActivas: 0, usuariosActivos: 1, quejasAbiertas: 0 },
  { id: 3, nombre: 'Dependencia cerrada', activa: false, categoriasActivas: 0, usuariosActivos: 0, quejasAbiertas: 0 },
]

export const CATEGORIAS: CategoriaAdmin[] = [
  { id: 10, nombre: 'Baches', activa: true, dependencia: { id: 1, nombre: 'Dirección de Obras', activa: true }, camposExtra: 2, slaCompleto: true },
  { id: 11, nombre: 'Árboles caídos', activa: false, dependencia: { id: 1, nombre: 'Dirección de Obras', activa: true }, camposExtra: 0, slaCompleto: false },
]

export const ZONAS: ZonaAdmin[] = [
  { id: 20, nombre: 'Zona 1', tipo: 'zona', activa: true },
  { id: 21, nombre: 'El Mirador', tipo: 'colonia', activa: true },
  { id: 22, nombre: 'Aldea Vieja', tipo: 'aldea', activa: false },
]

// Monta la página en /admin/… con un router de datos, para comprobar enlaces y parámetros.
export function montarEn(ruta: string, elemento: ReactElement) {
  const camino = ruta.split('?')[0]
  const router = createMemoryRouter(
    [
      { path: camino, element: elemento },
      { path: '/admin/sla', element: <p>pantalla-sla</p> },
      { path: '/admin/categorias', element: <p>pantalla-categorias</p> },
    ].filter((r, i, todas) => todas.findIndex((x) => x.path === r.path) === i),
    { initialEntries: [ruta] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}
